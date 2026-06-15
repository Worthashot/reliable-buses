import datetime
import logging
import math
import multiprocessing as mp
import os
import signal
import sys
import threading
import time
from multiprocessing import Queue
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv  # type: ignore

from .app_state import AppState
from .general_utility import drain_queue, get_memory_usage, verify_environment_variables
from .processes import api_accessors as api
from .processes import (
    daily_migrate_process,
    daily_update_long_process,
    timetable_manager_daily_process,
)
from .processes.api_accessors import managers as api_mgrs
from .processes.logger_writer import LoggerWriter
from .update_save_coordinator import UpdateSaveCoordinator

original_stdout = sys.stdout
original_stderr = sys.stderr

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(threadName)s - %(message)s",
    stream=original_stdout,
)
sys.stdout = LoggerWriter(logging.getLogger("STDOUT"), logging.INFO)
sys.stderr = LoggerWriter(logging.getLogger("STDERR"), logging.ERROR)


class DailyUpdateSequenceError(Exception):
    pass


class LondonServerProcessManager:
    # initiation code

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.api_manager = api_mgrs.APIManager()
        etl_root = Path(__file__).parent.parent
        env_path = etl_root / ".env"
        load_dotenv(dotenv_path=env_path)

        bus_project_url = os.getenv("BUS_PROJECT_URL")
        bus_project_key = os.getenv("BUS_PROJECT_KEY")
        tfl_url = os.getenv("TFL_URL")
        tfl_key = os.getenv("TFL_KEY")
        stop_csv_url = os.getenv("STOP_CSV_URL")
        stop_csv_location = os.getenv("STOP_CSV_LOCATION")
        journeys_basic_unuploaded_cache_location = os.getenv(
            "JOURNEYS_BASIC_UNUPLOADED_CACHE_LOCATION"
        )
        journeys_basic_inactive_cache_location = os.getenv(
            "JOURNEYS_BASIC_INACTIVE_CACHE_LOCATION"
        )
        stops_basic_cache_location = os.getenv("STOPS_BASIC_CACHE_LOCATION")
        timetables_basic_cache_location = os.getenv("TIMETABLES_BASIC_CACHE_LOCATION")
        savestate_location = os.getenv("SAVESTATE_LOCATION")
        (
            self.bus_project_url,
            self.bus_project_key,
            self.tfl_url,
            self.tfl_key,
            self.stop_csv_url,
            self.stop_csv_location,
            self.journeys_basic_unuploaded_cache_location,
            self.journeys_basic_inactive_cache_location,
            self.stops_basic_cache_location,
            self.timetables_basic_cache_location,
            self.savestate_location
        ) = verify_environment_variables(
            bus_project_url,
            bus_project_key,
            tfl_url,
            tfl_key,
            stop_csv_url,
            stop_csv_location,
            journeys_basic_unuploaded_cache_location,
            journeys_basic_inactive_cache_location,
            stops_basic_cache_location,
            timetables_basic_cache_location,
            savestate_location,
            self.logger,
        )

        assert isinstance(self.bus_project_url, str)
        assert isinstance(self.timetables_basic_cache_location, str)

        # used to ensure the daily update does not run twice
        self.sequence_lock = threading.Lock()

        self.save_coordinator = UpdateSaveCoordinator()

        self.error_queue = Queue()

        self.shutdown_event = threading.Event()
        self.process_shutdown_event = mp.Event()
        self.processes = []
        self.arrival_thread = None
        try:
            self.state = AppState.load(self.savestate_location)
            print("Loaded previous state")
        except FileNotFoundError:
            print("No previous state detected, starting fresh ")
            self.startup_from_scratch()
        except Exception as e:
            print(f"Error loading state: {e}. Starting fresh.")
            self.startup_from_scratch()

        if self.state.must_restart:
            print("Invalid save state detected, starting fresh ")
            self.startup_from_scratch()
        self.state.save(self.savestate_location)

    def startup_from_scratch(self):
        try:
            self.state = AppState()
            self.state.journey_manager = api_mgrs.LondonJourneyManager(
                self.bus_project_url,
                self.bus_project_key,
                self.tfl_key,
                self.journeys_basic_unuploaded_cache_location,
                self.journeys_basic_inactive_cache_location,
            )
            self.state.stop_manager = api_mgrs.LondonStopManager(
                self.bus_project_url,
                self.bus_project_key,
                self.stop_csv_url,
                self.stop_csv_location,
                self.tfl_key,
                self.stops_basic_cache_location,
            )

            self.state.arrival_manager = api_mgrs.LondonArrivalManager(
                self.bus_project_url, self.bus_project_key, self.tfl_key
            )

            self.state.timetable_manager = api_mgrs.LondonTimetableManager(
                self.bus_project_url,
                self.bus_project_key,
                self.tfl_key,
                self.timetables_basic_cache_location,
            )
            self.logger.info("starting journey_manager.UpdateJourneys()")
            self.state.journey_manager.update_journeys(self.logger)
            self.logger.info("journey_manager.UpdateJourneys() completed")

            self.logger.info("starting stop_manager.download_stops_csv()")
            self.state.stop_manager.download_stops_csv(self.logger)
            self.logger.info("stop_manager.download_stops_csv() completed")

            self.logger.info("starting stop_manager.updateDailyStops()")
            self.state.stop_manager.update_daily_stops(self.logger)
            self.logger.info("stop_manager.updateDailyStops() completed")

            self.logger.info("starting arrival_manager.create_journey_dict()")
            self.state.arrival_manager.create_journey_dict(self.logger)
            self.logger.info("arrival_manager.create_journey_dict() completed")

        except Exception as e:
            self.logger.exception("Critical Error in startup_from_scratch:\n" + repr(e))
            url = self.bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": self.bus_project_key}
            subject = "startup_from_scratch Critical Error :" + repr(e)
            details = (
                "Critical Error in startup_from_scratch:\n"
                + repr(e)
                + "\n"
                + "program should terminate and restart from scratch."
            )
            try:
                self.api_manager.post_error(url, headers, subject, details, self.logger)
            except Exception as e:
                self.logger.exception("High Error, unable to mail error.\n" + repr(e))
            self.handle_critical_error()

    # ----------------------------------------------------------------------------------------------
    # shutdown code
    def graceful_shutdown(self, signum, frame):  # noqa: ARG002
        print("shutdown drequested. Finishing tasks")
        self.shutdown_event.set()

    def _terminate_processes(self, grace_seconds=40):
        # First, signal all processes to exit voluntarily
        import time

        self.process_shutdown_event.set()  # signal all to exit

        deadline = time.time() + grace_seconds

        for p in self.processes:
            remaining = deadline - time.time()
            if remaining > 0:
                p.join(timeout=remaining)
            if p.is_alive():
                p.terminate()  # SIGTERM

        # After all terminated, give them an extra 5 seconds total
        for p in self.processes:
            p.join(timeout=5)
            if p.is_alive():
                p.kill()  # SIGKILL
                p.join()

        self.logger.info("All threads finished. Exiting.")

    def handle_critical_error(self):

        # 1. Delete saved state to avoid loading corrupted data next time
        AppState.delete(self.savestate_location)
        self.logger.info("Deleted corrupted state file.")

        # 2. Terminate all child processes (if any)
        for p in self.processes:
            if p.is_alive():
                self.logger.warning(f"Terminating process {p.name}")
                p.terminate()
                time.sleep(0.5)
                if p.is_alive():
                    p.kill()

        # 3. Force exit the whole process - threads will be killed
        os._exit(1)  # immediate exit, no cleanup, no atexit

    def save_state(self):
        self.logger.info("Saving state")
        self.save_coordinator.begin_save()
        try:
            self.state.save(self.savestate_location)
        except Exception as e:
            self.logger.exception("Critical Error in save_state\n" + repr(e))
            url = self.bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": self.bus_project_key}
            subject = "save_state Critical Error :" + repr(e)
            details = (
                "Critical Error in save_state:\n"
                + repr(e)
                + "\n"
                + "State was unable to be saved."
                + " program should terminate and restart from scratch"
            )
            try:
                self.api_manager.post_error(url, headers, subject, details, self.logger)
            except Exception as e:
                self.logger.exception("High Error, unable to mail error.\n" + repr(e))

            self.handle_critical_error()
        finally:
            self.save_coordinator.end_save()

    # ----------------------------------------------------------------------------------------------
    # Threads

    # Thread for updating arriving busses. runs every minute, takes ~30 seconds
    # Must finish work before quitting
    def arrival_run_loop(self):
        self.logger.info("Started ArrivalManager.update_busses() thread")
        while not self.shutdown_event.is_set():
            start_time = time.time()
            self.save_coordinator.begin_update()
            try:
                self.logger.info("Started arrival_manager.update_busses()")
                self.state.arrival_manager.update_busses(self.logger)
                mem = get_memory_usage() / (1024 * 1024)
                self.logger.info(f"Currently using {mem:.2f} MB of memory")
                self.logger.info("arrival_manager.update_busses() success")

            except Exception as e:
                self.logger.exception(
                    "Critical Error in ArrivalManager.update_busses()\n" + repr(e)
                )
                url = self.bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": self.bus_project_key}
                subject = "daily_update_long_process Critical Error :" + repr(e)
                details = (
                    "Critical Error in arrival_run_loop:\n"
                    + repr(e)
                    + "\n"
                    + "program should terminate and restart from save state."
                )
                try:
                    self.api_manager.post_error(
                        url, headers, subject, details, self.logger
                    )
                except Exception as e:
                    self.logger.exception(
                        "High Error, unable to mail error.\n" + repr(e)
                    )
                self.handle_critical_error()
            finally:
                self.save_coordinator.end_update()
            elapsed = time.time() - start_time
            # Sleep just enough to keep a 60-second cadence
            self.logger.info(
                f"Next arrival scan sequence scheduled for {max(0, 60 - elapsed):.0f}s"
            )
            self.shutdown_event.wait(timeout=max(0, 60 - elapsed))

    # Thread for getting today's list of journeys, and assigning these to the arrival manager
    # takes ~20 minutes to finish
    # Must be forced to stop if mid run, will assign arrival manager to
    def daily_update_sequence(self):
        """
        Perform the daily update sequence:
        1. ArrivalManager.start_update()
        2. JourneyManager.update()
        3. ArrivalManager.update()
        4. ArrivalManager.finish_update()
        Runs once per day at 4:00 AM.
        """
        self.logger.info("Started daily update sequence thread")
        while not self.shutdown_event.is_set():
            # Compute next run at 4:00 AM
            now = datetime.datetime.now(ZoneInfo("Europe/London"))
            target = datetime.datetime.combine(now.date(), datetime.time(4, 0, 0), tzinfo=ZoneInfo("Europe/London"))
            if now >= target:
                target += datetime.timedelta(days=1)
            sleep_seconds = (target - now).total_seconds()
            self.logger.info(
                f"Next daily update sequence scheduled at {target} (sleeping {sleep_seconds:.0f}s)"
            )
            for _s in range(math.ceil(sleep_seconds)):
                time.sleep(1)
                if self.shutdown_event.is_set():
                    break
            if self.shutdown_event.is_set():
                break

            # Acquire lock to ensure only one sequence runs at a time
            with self.sequence_lock:
                self.logger.info("Starting daily update sequence")
                try:
                    # Step 1: copy old data
                    self.save_coordinator.begin_update()
                    self.state.arrival_manager.start_daily_update()
                    self.save_coordinator.end_update()
                    self.logger.info("Called arrival_manager.start_daily_update()")

                    long_process = mp.Process(
                        target=daily_update_long_process,
                        args=(
                            self.process_shutdown_event,
                            self.state.journey_manager,
                            self.state.stop_manager,
                            self.bus_project_url,
                            self.bus_project_key,
                            self.error_queue,
                        ),
                    )
                    long_process.start()
                    while long_process.is_alive():
                        long_process.join(timeout=1)
                        if not self.error_queue.empty():
                            exc = self.error_queue.get()
                            drain_queue(self.error_queue)
                            long_process.terminate()
                            long_process.join()

                            raise DailyUpdateSequenceError(
                                f"Child process failed: {exc}"
                            ) from exc

                    if not self.error_queue.empty():
                        drain_queue(self.error_queue)
                        exc = self.error_queue.get()
                        raise DailyUpdateSequenceError(
                            f"Child process failed: {exc}"
                        ) from exc

                    # Step 3: run ArrivalManager.update()
                    if not self.shutdown_event.is_set():
                        self.save_coordinator.begin_update()
                        self.state.arrival_manager.create_journey_dict(self.logger)
                        self.save_coordinator.end_update()

                        self.logger.info(
                            "arrival_manager.create_journey_dict() completed"
                        )

                    # Step 4: signal that new data is ready
                    self.save_coordinator.begin_update()
                    self.state.arrival_manager.finish_daily_update()
                    self.save_coordinator.end_update()
                    self.logger.info("arrival_manager.finish_daily_update() called")

                except Exception as e:
                    self.logger.exception(
                        "Critical Error during daily update sequence\n" + repr(e)
                    )
                    url = self.bus_project_url + "/mail/send_error_email"
                    headers = {"x-api-key": self.bus_project_key}
                    subject = "daily_update_sequence Critical Error :" + repr(e)
                    details = (
                        "Critical Error in daily_update_sequence:\n"
                        + repr(e)
                        + "\n"
                        + " Program must shut down and restart from scratch"
                    )
                    try:
                        self.api_manager.post_error(
                            url, headers, subject, details, self.logger
                        )
                    except Exception as e:
                        self.logger.exception(
                            "High Error, unable to mail error.\n" + repr(e)
                        )
                    self.handle_critical_error()
                self.save_state()

    # Thread for validating busses
    def validate_busses(self):
        """Run ArrivalManager.run_valdation() once every 2 hours."""
        self.logger.info("Started validate_busses thread")
        while not self.shutdown_event.is_set():
            now = datetime.datetime.now(ZoneInfo("Europe/London"))
            target = now + datetime.timedelta(hours=2)
            self.logger.info(
                f"Next validate_busses sequence scheduled at {target} (sleeping {(target - now).total_seconds():.0f}s)"
            )
            sleep_seconds = (target - now).total_seconds()
            for _s in range(math.ceil(sleep_seconds)):
                time.sleep(1)
                if self.shutdown_event.is_set():
                    break

            # Wait until API has finished migrating
            has_just_finished_migrating = False
            try:
                migrating_status = "migrating"
                while migrating_status == "migrating":
                    if self.shutdown_event.is_set():
                        break
                    self.logger.info("Checking if API is migrating or deleting")
                    migrating_status = api.check_migrating(
                        self.bus_project_url, self.bus_project_key, self.logger
                    )
                    if migrating_status == "running":
                        has_just_finished_migrating = True
                    if self.shutdown_event.is_set():
                        break
                if self.shutdown_event.is_set():
                    break
                if migrating_status != "succeeded":
                    self.logger.exception(
                        "Critical Error in validate_busses\n"
                        + "API merging status is "
                        + migrating_status
                    )
                    subject = (
                        "validate_busses Critical Error : API merging status is "
                        + migrating_status
                    )
                    details = (
                        "Critical Error in validate_busses:\nAPI merging status is "
                        + migrating_status
                        + " program should terminate and restart from scratch. "
                        + "API integrity needs checked."
                    )
                    url = self.bus_project_url + "/mail/send_error_email"
                    headers = {"x-api-key": self.bus_project_key}
                    try:
                        self.api_manager.post_error(
                            url, headers, subject, details, self.logger
                        )
                    except Exception as e:
                        self.logger.exception(
                            "High Error, unable to mail error.\n" + repr(e)
                        )
                    self.handle_critical_error()
            except Exception as e:
                self.logger.exception("High Error in validate_busses()\n" + repr(e))
                subject = "validate_busses High Error :" + repr(e)
                details = (
                    "High Error in validate_busses:\n"
                    + repr(e)
                    + "\n"
                    + "Table entries have not been validated."
                )
                url = self.bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": self.bus_project_key}
                try:
                    self.api_manager.post_error(
                        url, headers, subject, details, self.logger
                    )
                except Exception as e2:
                    self.logger.exception(
                        "High Error, unable to mail error.\n" + repr(e2)
                    )
                continue

            # todo
            # if migrating has just finished, wait 20 secodns for deletion to start.
            # band aid fix, for a real fix, have a queue of jobs on the API that stops conflicts
            if has_just_finished_migrating:
                time.sleep(5)
                if self.shutdown_event.is_set():
                    break
                time.sleep(5)
                if self.shutdown_event.is_set():
                    break
                time.sleep(5)
                if self.shutdown_event.is_set():
                    break
                time.sleep(5)

            # Wait until API has finished deleting
            if self.shutdown_event.is_set():
                break
            try:
                deleting_status = "deleting"
                while deleting_status == "deleting":
                    if self.shutdown_event.is_set():
                        break
                    self.logger.info("Checking if API is migrating or deleting")
                    deleting_status = api.check_deleting(
                        self.bus_project_url, self.bus_project_key, self.logger
                    )
                    if self.shutdown_event.is_set():
                        break
                if deleting_status != "succeeded":
                    self.logger.exception(
                        "Critical Error in validate_busses\n"
                        + "API deleting status is "
                        + deleting_status
                    )
                    subject = (
                        "validate_busses Critical Error : API deleting status is "
                        + deleting_status
                    )
                    details = (
                        "Critical Error in validate_busses:\n"
                        + "API deleting status is "
                        + deleting_status
                        + " program should terminate and restart from scratch. "
                        + "API integrity needs checked."
                    )
                    url = self.bus_project_url + "/mail/send_error_email"
                    headers = {"x-api-key": self.bus_project_key}
                    try:
                        self.api_manager.post_error(
                            url, headers, subject, details, self.logger
                        )
                    except Exception as e:
                        self.logger.exception(
                            "High Error, unable to mail error.\n" + repr(e)
                        )
                    self.handle_critical_error()
            except Exception as e:
                self.logger.exception("High Error in validate_busses()\n" + repr(e))
                subject = "validate_busses High Error :" + repr(e)
                details = (
                    "High Error in validate_busses:\n"
                    + repr(e)
                    + "\n"
                    + "Table entries have not been validated."
                )
                url = self.bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": self.bus_project_key}
                try:
                    self.api_manager.post_error(
                        url, headers, subject, details, self.logger
                    )
                except Exception as e2:
                    self.logger.exception(
                        "High Error, unable to mail error.\n" + repr(e2)
                    )
                continue
            if self.shutdown_event.is_set():
                break
            url = self.bus_project_url + "/taskstatus/start_task"
            headers = {"x-api-key": self.bus_project_key,
                       "Content-Type": "text/plain"}
            data = "validating"
            try:
                self.logger.info("setting API to validating")
                _r, _attempts = self.api_manager.post_api(url, headers, self.logger, data = data)
            except Exception as e:
                self.logger.exception("High Error in validate_busses()\n" + repr(e))
                subject = "validate_busses High Error :" + repr(e)
                details = (
                    "High Error in validate_busses:\n"
                    + repr(e)
                    + "\n"
                    + "Table entries have not been validated."
                )
                url = self.bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": self.bus_project_key}
                try:
                    self.api_manager.post_error(
                        url, headers, subject, details, self.logger
                    )
                except Exception as e2:
                    self.logger.exception(
                        "High Error, unable to mail error.\n" + repr(e2)
                    )
                continue
            if self.shutdown_event.is_set():
                self.logger.info("setting API to successful Validating")
                url = self.bus_project_url + "/taskstatus/end_task"
                headers = {"x-api-key": self.bus_project_key,
                        "Content-Type": "text/plain"}
                data = "validating"
                try:
                    _r, _attempts = self.api_manager.post_api(url, headers, self.logger, data=data)
                except Exception as e:
                    self.logger.exception(
                        "Critical Error in validate_busses()\n"
                        + repr(e)
                        + "\nAPI validation has"
                        + "not been reset"
                    )
                    subject = "validate_busses Critical Error :" + repr(e)
                    details = (
                        "Critical Error in validate_busses:\n"
                        + repr(e)
                        + "\n"
                        + "API validation has not been reset"
                    )
                    url = self.bus_project_url + "/mail/send_error_email"
                    headers = {"x-api-key": self.bus_project_key}
                    try:
                        self.api_manager.post_error(
                            url, headers, subject, details, self.logger
                        )
                    except Exception as e2:
                        self.logger.exception(
                            "High Error, unable to mail error.\n" + repr(e2)
                        )
                    self.handle_critical_error()
                break
            self.save_coordinator.begin_update()
            try:
                self.logger.info("running validation")
                self.state.arrival_manager.run_valdation(self.logger)
                self.logger.info("arrival_manager.run_valdation() completed")

            except Exception as e:
                self.logger.exception(
                    "Critical Error in arrival_manager.run_valdation()\n" + repr(e)
                )
                url = self.bus_project_url + "/taskstatus/fail_task"
                headers = {"x-api-key": self.bus_project_key,
                        "Content-Type": "text/plain"}
                data = "validating"
                try:
                    _r, _attempts = self.api_manager.post_api(url, headers, self.logger, data=data)
                except Exception as e2:
                    self.logger.exception(
                        "Critical Error in arrival_manager.run_valdation()\n"
                        + repr(e2)
                        + ". Unable to set validator to failed"
                    )
                    url = self.bus_project_url + "/mail/send_error_email"
                    headers = {"x-api-key": self.bus_project_key}
                    subject = "daily_update_sequence Critical Error :" + repr(e2)
                    details = (
                        "Critical Error in daily_update_sequence:\n"
                        + repr(e2)
                        + "\n"
                        + "program should terminate and restart from scratch."
                    )
                    try:
                        self.api_manager.post_error(
                            url, headers, subject, details, self.logger
                        )
                    except Exception as e3:
                        self.logger.exception(
                            "High Error, unable to mail error.\n" + repr(e3)
                        )
                url = self.bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": self.bus_project_key}
                subject = "daily_update_sequence Critical Error :" + repr(e)
                details = (
                    "Critical Error in daily_update_sequence:\n"
                    + repr(e)
                    + "\n"
                    + "program should terminate and restart from scratch."
                )
                try:
                    self.api_manager.post_error(
                        url, headers, subject, details, self.logger
                    )
                except Exception as e2:
                    self.logger.exception(
                        "High Error, unable to mail error.\n" + repr(e2)
                    )

                self.handle_critical_error()
            finally:
                self.logger.info("setting API to finish Validating")
                url = self.bus_project_url + "/taskstatus/end_task"
                headers = {"x-api-key": self.bus_project_key,
                        "Content-Type": "text/plain"}
                data = "validating"
                try:
                    _r, _attempts = self.api_manager.post_api(url, headers, self.logger, data = data)
                except Exception as e:
                    self.logger.exception(
                        "Critical Error in validate_busses()\n"
                        + repr(e)
                        + "\nAPI validation has"
                        + "not been reset"
                    )
                    subject = "validate_busses Critical Error :" + repr(e)
                    details = (
                        "Critical Error in validate_busses:\n"
                        + repr(e)
                        + "\n"
                        + "API validation has not been reset"
                    )
                    url = self.bus_project_url + "/mail/send_error_email"
                    headers = {"x-api-key": self.bus_project_key}
                    try:
                        self.api_manager.post_error(
                            url, headers, subject, details, self.logger
                        )
                    except Exception as e:
                        self.logger.exception(
                            "High Error, unable to mail error.\n" + repr(e)
                        )
                    self.handle_critical_error()
                self.save_coordinator.end_update()
            self.save_state()

    # ----------------------------------------------------------------------------------------------
    # main initiation script

    def main(self):
        signal.signal(signal.SIGTERM, self.graceful_shutdown)
        signal.signal(signal.SIGINT, self.graceful_shutdown)
        timetable_mgr = self.state.timetable_manager

        # Create daemon threads for each recurring task
        threads = [
            threading.Thread(
                target=self.arrival_run_loop, name="ArrivalRun", daemon=False
            ),
            threading.Thread(
                target=self.daily_update_sequence, name="DailySequence", daemon=False
            ),
            threading.Thread(
                target=self.validate_busses, name="Validate", daemon=False
            ),
        ]

        for t in threads:
            t.start()
            self.logger.info(f"Started thread: {t.name}")

        process_infos = [
            (
                timetable_manager_daily_process,
                (
                    timetable_mgr,
                    self.process_shutdown_event,
                    self.bus_project_url,
                    self.bus_project_key,
                ),
                "TimetableDaily",
            ),
            (
                daily_migrate_process,
                (
                    self.process_shutdown_event,
                    self.bus_project_url,
                    self.bus_project_key,
                ),
                "Migrate",
            ),
        ]

        for target, args, name in process_infos:
            p = mp.Process(target=target, args=args, name=name)
            p.start()
            self.processes.append(p)
            self.logger.info(f"Started process: {name}")

        # Keep the main thread alive (daemon threads will exit when the main thread does)
        self.logger.info("All threads started. Daemon is running.")

        self.shutdown_event.wait()

        self.logger.info("Shutdown event received.")
        self._terminate_processes(grace_seconds=40)

        for t in threads:
            t.join(timeout=30)
            if t.is_alive():
                self.logger.warning(f"Thread {t.name} still alive after join")
