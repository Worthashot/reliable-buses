"""
Created on Sun Jun  7 14:46:39 2026

@author: Cameron
"""

import datetime
import math
import time
from zoneinfo import ZoneInfo

from .api_accessors.managers.api_manager import APIManager
from .process_utility import setup_process_logging


def timetable_manager_daily_process(
    timetable_mgr, process_shutdown_event, bus_project_url, bus_project_key
):
    """Run TimetableManager.update() once per day at 1:00 AM."""
    api_manager = APIManager()
    logger = setup_process_logging()
    logger.info("Started TimetableManager daily process")
    while not process_shutdown_event.is_set():
        now = datetime.datetime.now(ZoneInfo("Europe/London"))
        target = datetime.datetime.combine(now.date(), datetime.time(1, 0, 0))
        if now >= target:
            target += datetime.timedelta(days=1)
        logger.info(
            f"Next timetable update sequence scheduled at {target} (sleeping {(target - now).total_seconds():.0f}s)"
        )
        sleep_seconds = (target - now).total_seconds()
        for _s in range(math.ceil(sleep_seconds)):
            time.sleep(1)
            if process_shutdown_event.is_set():
                break
        if process_shutdown_event.is_set():
            break

        try:
            logger.info("TimetableManager starting daily_timetable_check()")
            timetable_mgr.daily_timetable_check(logger)
            logger.info("TimetableManager.daily_timetable_check() completed")

        except Exception as e:
            logger.exception(
                "High Error in TimetableManager.daily_timetable_check()\n" + repr(e)
            )
            url = bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": bus_project_key}
            subject = "timetable_manager_daily_process High Error :" + repr(e)
            details = (
                "High Error in timetable_manager_daily_process:\n"
                + repr(e)
                + "\n"
                + "New timetables not read. "
            )
            try:
                api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            continue
    logger.info("Process shutdown recieved, terminating")
