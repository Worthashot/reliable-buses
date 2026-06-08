"""
Created on Tue Jan  6 15:25:47 2026

@author: Cameron
"""

# This is responsible for updating the arrivals_basic.db with all arrivals for a day. It does this by
# checking the API every period (currently 30 seconds, might do quicker) and checking the stop each active bus
# has last pased against the list of stops it should pass on its Journey.
import json
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

import dateutil.parser
import pandas as pd

from .api_manager import APIManager
from .primitives.bus import Bus
from .primitives.journey import Journey


class LondonArrivalManager:
    def __init__(self, database_url, bus_project_api_key, tfl_api_key):
        self._lock = threading.Lock()
        self.is_updating = False
        self.database_url = database_url
        self.bus_project_api_key = bus_project_api_key
        self.tfl_api_key = tfl_api_key
        self.unuploaded_chunks = []
        self.undeleted_chunks = []
        self.unvalidated_chunks = []

        # dict of busId : Int = bus : Bus
        self.active_busses: dict[int, list[Bus]] = {}
        self.active_busses_staging: dict[int, list[Bus]] = {}

        # format [(service, origin, destination)] = [Journeys]
        self.active_journeys: dict[tuple[str, str, str], list[Journey]] = {}
        self.active_journeys_staging: dict[tuple[str, str, str], list[Journey]] = {}

        # format [(service, direction)] = [(origin, origin_id, destination, destination_id, count)]
        self.route_direction_dict: dict[
            tuple[str, str], list[tuple[str, str, str, str, str]]
        ] = {}
        self.route_direction_dict_staging: dict[
            tuple[str, str], list[tuple[str, str, str, str, str]]
        ] = {}

        # list of pairs of trip_id and journey_id to remove from the arrivals list to remove from the database
        self.arrivals_to_remove: set[tuple[str, str, str, int, str]] = set()

        self.arrivals_to_validate: set[tuple[str, str, str, int, str]] = set()

        self.problem_busses = []
        self.problem_journeys = []

        self.cahed_dataframe = []

        self.api_manager = APIManager()

    # To be ran once a day before every manager starts updating. Moves current active data to staging
    # So busses can be searched during, and after updating.
    def start_daily_update(self):
        with self._lock:
            self.is_updating = True

            self.active_busses_staging = self.active_busses
            self.active_busses = {}

            self.active_journeys_staging = self.active_journeys
            self.active_journeys = {}

            self.route_direction_dict_staging = self.route_direction_dict
            self.route_direction_dict = {}

    # To be ran once a day once create_journey_dict has finished
    def finish_daily_update(self):
        with self._lock:
            self.is_updating = False

    # To be ran once a day. Will read the database of valid journeys for this day, and create
    # a journey object for each.
    # Will also set up several helper dicionaries to help map theset of possible journeys for a given bus, via
    # information given by that bus such as destination, service number, and direction

    def create_journey_dict(self, logger):
        with self._lock:
            headers = {"x-api-key": self.bus_project_api_key}
            url = self.database_url + "/basic/active_journeys"
            try:
                request, _attempts = self.api_manager.get_api(url, headers, logger)
            except Exception as e:
                logger.exception(
                    f"High error, unable to lookup API for today's journeys at {url}\n{e!r}"
                )
                url = self.database_url + "/mail/send_error_email"
                headers = {"x-api-key": self.bus_project_api_key}
                subject = f"LondonArrivalManager High Error: cannot lookup Project API : {e!r}"
                details = (
                    "High error, unable to lookup daily API for journey change. will proceed using previous "
                    + "valid journies. If a route passes an unexpected stop, data will not be usable for this day."
                    + "URL "
                    + url
                    + f" Error Code {e!r}"
                    + "."
                )

                try:
                    self.api_manager.post_error(url, headers, subject, details, logger)
                except Exception as e:
                    logger.exception("High Error, unable to mail error.\n" + repr(e))
                return None

            df = pd.DataFrame(request.json())

            request = []

            for row in df.itertuples(index=True):
                try:
                    service = str(row.service)
                except Exception as e:
                    logger.warning(f"stored service is not string. got {e!r}")
                    continue
                try:
                    origin = str(row.origin)
                except Exception as e:
                    logger.warning(f"stored origin is not string. got {e!r}")
                    continue
                try:
                    destination = str(row.destination)
                except Exception as e:
                    logger.warning(f"stored destination is not string. got {e!r}")
                    continue
                try:
                    stop_list = str(row.stop_list)
                except Exception as e:
                    logger.warning(f"stored stop_list is not string. got {e!r}")
                    continue
                try:
                    direction = str(row.direction)
                except Exception as e:
                    logger.warning(f"stored direction is not string. got {e!r}")
                    continue
                try:
                    origin_id = str(row.origin_id)
                except Exception as e:
                    logger.warning(f"stored origin_id is not string. got {e!r}")
                    continue
                try:
                    destination_id = str(row.destination_id)
                except Exception as e:
                    logger.warning(f"stored destination_id is not string. got {e!r}")
                    continue
                try:
                    route_section_name = str(row.route_section_name)
                except Exception as e:
                    logger.warning(
                        f"stored route_section_name is not string. got {e!r}"
                    )
                    continue
                try:
                    date_added = str(row.date_added)
                except Exception as e:
                    logger.warning(f"stored date_added is not string. got {e!r}")
                    continue

                service = service.lower()

                count = route_section_name.split(":")[2]
                if (service, origin, destination) in self.active_journeys:
                    self.active_journeys[(service, origin, destination)].append(
                        Journey(
                            route_section_name,
                            stop_list.split(","),
                            direction,
                            date_added,
                        )
                    )
                else:
                    self.active_journeys[(service, origin, destination)] = [
                        Journey(
                            route_section_name,
                            stop_list.split(","),
                            direction,
                            date_added,
                        )
                    ]

                if (service, direction) in self.route_direction_dict:
                    self.route_direction_dict[(service.lower(), direction)].append(
                        (origin, origin_id, destination, destination_id, count)
                    )
                else:
                    self.route_direction_dict[(service.lower(), direction)] = [
                        (origin, origin_id, destination, destination_id, count)
                    ]

            return True

    # This is the main function of the whole project. Will run periodically (30 seconds? maybe even 10.)
    # This gets the list of recent arrivals, and almost arrivals, and stores a list of arivals that arrive
    # arrivals consist of the trip that arrived, which journey it was on, and which stop it arrive with
    # as well as arrival time
    def update_busses(self, logger):
        # How far out we store busses. Larger means less busses missed, lower is less ram used
        # seek_time = 2*60*60
        seek_time = 10 * 60
        with self._lock:
            url = "https://api.tfl.gov.uk/Mode/bus/Arrivals?count=-1"
            headers = {
                # Request headers
                "Cache-Control": "no-cache",
                "app_key": self.tfl_api_key,
            }
            try:
                r, _attempts = self.api_manager.get_api(url, headers, logger)
            except Exception as e:
                logger.exception(
                    "Medium error, "
                    + repr(e)
                    + ". Unable to lookup periodic API for bus arrivals. Busses for this period will not"
                    + " be recorded"
                )
                url = self.database_url + "/mail/send_error_email"
                headers = {"x-api-key": self.bus_project_api_key}
                subject = "LondonArrivalManager Medium Error: " + repr(e)
                details = (
                    "Medium error, unable to lookup periodic API for bus arrivals. Busses for this period will not"
                    + " be recorded\n"
                    + "URL "
                    + url
                )
                try:
                    self.api_manager.post_error(url, headers, subject, details, logger)
                except Exception as e:
                    logger.exception("High Error, unable to mail error.\n" + repr(e))
                return

            data = r.json()
            now = datetime.now(ZoneInfo("Europe/London"))
            for bus in data:
                arrival_time = dateutil.parser.parse(bus["expectedArrival"])
                if abs(int((arrival_time - now).total_seconds())) <= seek_time:
                    if self.is_updating:
                        self.add_bus_data(bus, self.active_busses_staging, staging=True)
                    else:
                        self.add_bus_data(bus, self.active_busses, staging=False)
            r = []
            data = []

            self.update_arrivals(
                self.active_busses_staging, self.active_journeys_staging, logger
            )

            if not self.is_updating:
                self.update_arrivals(self.active_busses, self.active_journeys, logger)

            self.remove_specific_invalid_arrivals(logger)
            return

    # this checks a given arrival for data that can link the given trip with which journey it is on
    # if a bus trip has already been recorded, Use the new stop to give an updated list of arrived stops
    def add_bus_data(self, bus, active_busses, staging=False):
        bus_id = bus["tripId"]
        arrival_time = dateutil.parser.parse(bus["expectedArrival"])

        if bus_id not in active_busses:
            potential_bus_origin_terminuses = self.match_origin_terminus(
                bus["lineId"], bus["direction"], staging
            )
            if not potential_bus_origin_terminuses:
                return
            for p in potential_bus_origin_terminuses:
                origin = p[0]
                origin_id = p[1]
                terminus = p[2]
                terminus_id = p[3]
                count = p[4]
                btime = (
                    arrival_time.second
                    + 60 * arrival_time.minute
                    + 60 * 60 * arrival_time.hour
                )
                date = int(arrival_time.strftime("%Y-%m-%d").replace("-", ""))
                new_bus = Bus(
                    bus_id,
                    bus["naptanId"],
                    btime,
                    date,
                    bus["lineId"],
                    origin,
                    origin_id,
                    terminus,
                    terminus_id,
                    bus["direction"],
                    count,
                )
                if bus_id in active_busses:
                    active_busses[bus_id].append(new_bus)
                else:
                    active_busses[bus_id] = [new_bus]
        else:
            for active_bus in active_busses[bus_id]:
                active_bus.update(bus["naptanId"], arrival_time)

    # This assigns a new trip to the set of possible journeys it may be on
    # returns a list containing every possible journey name this bus trip could possibly be assigned to given the
    # direction and service
    def match_origin_terminus(self, bus_service, bus_direction, staging):
        if staging:
            route_direction_dict = self.route_direction_dict_staging
        else:
            route_direction_dict = self.route_direction_dict

        if (bus_service, bus_direction) not in route_direction_dict:
            # TODO
            # printing out these errors is becoming way too cluttered.
            # Imlpement a better sysyem for detecting missed data
            # print("error, bus service combo not in today's journeys")
            # print("service " + str(bus_service) + ", going in direction " + str(bus_direction))
            return False
        return route_direction_dict[(bus_service.lower(), bus_direction)]

    # Going through out updated list of live busses, check if a bus has arrived at a new stop since the last check.
    # If so, record its arrival
    def update_arrivals(
        self, active_busses: dict[int, list[Bus]], active_journeys, logger
    ):
        bus_id_to_remove = []
        items = []
        for bus_id, busses in active_busses.items():
            busses_to_remove = []
            service = busses[0].service
            direction = busses[0].direction
            i = 0
            for bus in busses:
                passed_stops = bus.visited_locations - bus.stored_locations
                if passed_stops == set():
                    continue

                origin = bus.origin
                origin_id = bus.origin_id
                destination = bus.terminus
                destination_id = bus.terminus_id
                count = bus.journey_count

                journeys = active_journeys[(service.lower(), origin, destination)]
                any_valid = False
                for journey in journeys:
                    if (
                        bus.visited_locations & set(journey.list_of_stops)
                    ) != bus.visited_locations:
                        self.arrivals_to_remove.add(
                            (service, origin_id, destination_id, bus_id, count)
                        )
                        continue

                    any_valid = True
                    date_added = journey.date_added
                    for stop in passed_stops:
                        item = {}
                        item["service"] = service
                        item["time"] = bus.arrival_log[stop]["time"]
                        item["date"] = bus.arrival_log[stop]["date"]
                        item["origin"] = origin_id
                        item["destination"] = destination_id
                        item["date_added"] = date_added
                        item["stop_id"] = stop
                        item["bus_id"] = bus_id
                        item["count"] = count
                        item["valid"] = 0
                        items.append(item.copy())
                        bus.stored_locations.add(stop)
                if not any_valid:
                    busses_to_remove.append(i)
                i = i + 1

            if busses_to_remove:
                for index in sorted(busses_to_remove, reverse=True):
                    busses.pop(index)

            # TODO
            # This is the main loss of information. Settup a way to examine which busses have not been captured,
            # examine the list of stops those busses go to, then construct a new journey with observed information
            # Additionally, we should log these arrivals in a seperate table for arrivals with no journey yet created,
            # and merge them in once we construct the journey.
            if not busses:
                # TODO
                # printing out these errors is becoming way too cluttered.
                # Imlpement a better sysyem for detecting missed data
                # print("error, bus " + busId + " had no valid journeys assigned")
                # print("service " + service)
                # print("direction " + direction)
                self.problem_busses.append((service, direction, bus_id))
                bus_id_to_remove.append(bus_id)
                continue

        if bus_id_to_remove:
            for bus_id in bus_id_to_remove:
                active_busses.pop(bus_id, None)

        url = self.database_url + "/basic/new_arrivals"
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        items = items + [x for xs in self.unuploaded_chunks for x in xs]
        chunk_size = 50
        chunks = [items[x : x + chunk_size] for x in range(0, len(items), chunk_size)]
        self.unuploaded_chunks = []
        i = 0
        j = 0
        yes_upload = 0
        no_upload = 0
        # status = self.check_migrating()
        for chunk in chunks:
            # if status != "succeeded":
            # print(f"database busy. Caching chunk {i}")
            # self.unuploaded_chunks.append(chunk.copy())
            # i = i + 1
            # continue
            data = json.dumps(chunk)
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i + j} failed to add: {e!r}")
                self.unuploaded_chunks.append(chunk.copy())
                j = j + 1
                no_upload = no_upload + len(chunk)
                continue

            i = i + 1
            yes_upload = yes_upload + len(chunk)
        logger.info(f"\nUploaded {yes_upload} records in {i} chunks")
        logger.info(f"\nFailed to uploaded {no_upload} records in {j} chunks")

    def remove_specific_invalid_arrivals(self, logger):
        url = self.database_url + "/basic/delete_matching_invalid_arrivals"
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        items = [
            {
                "service": item[0],
                "origin": item[1],
                "destination": item[2],
                "bus_id": item[3],
                "count": item[4],
            }
            for item in self.arrivals_to_remove
        ]

        chunk_size = 50
        items = items + [x for xs in self.undeleted_chunks for x in xs]
        chunks = [items[x : x + chunk_size] for x in range(0, len(items), chunk_size)]
        self.undeleted_chunks = []
        i = 0
        j = 0
        yes_delete = 0
        no_delete = 0
        # status = self.check_migrating()
        for chunk in chunks:
            # if status != "succeeded":
            # print(f"database busy. Caching chunk {i}")
            # self.undeleted_chunks.append(chunk.copy())
            # i = i + 1
            # continue
            data = json.dumps(chunk)
            try:
                _response, _attempts = self.api_manager.delete_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i + j} failed to delete: {e!r}")
                self.undeleted_chunks.append(chunk.copy())
                j = j + 1
                no_delete = no_delete + len(chunk)
                continue

            i = i + 1
            yes_delete = yes_delete + len(chunk)

        logger.info(f"\nDeleted {yes_delete} records in {i} chunks")
        logger.info(f"\nFailed to delete {no_delete} records in {j} chunks")
        self.arrivals_to_remove = set()

    def validate_specific_valid_arrivals(self, logger):
        url = self.database_url + "/basic/set_valid_matching_invalid_arrivals"
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        items = [
            {
                "service": item[0],
                "origin": item[1],
                "destination": item[2],
                "bus_id": item[3],
                "count": item[4],
            }
            for item in self.arrivals_to_validate
        ]

        chunk_size = 50
        items = items + [x for xs in self.unvalidated_chunks for x in xs]
        chunks = [items[x : x + chunk_size] for x in range(0, len(items), chunk_size)]
        self.unvalidated_chunks = []
        i = 0
        j = 0
        yes_validate = 0
        no_validate = 0
        for chunk in chunks:
            data = json.dumps(chunk)
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i + j} failed to validate: {e!r}")
                self.unvalidated_chunks.append(chunk.copy())
                j = j + 1
                no_validate = no_validate + len(chunk)
                continue

            i = i + 1
            yes_validate = yes_validate + len(chunk)

        logger.info(f"\nValidated {yes_validate} records in {i} chunks")
        logger.info(f"\nFailed to validate {no_validate} records in {j} chunks")
        self.arrivals_to_validate = set()

    # To be ran every 2 hours. Will check all lists of busses for those that have not been active for 2 hours, and
    # checks if they have reached their final terminus. If so, this validates them for merger. Otherwise, deletes
    # their record.
    def run_valdation(self, logger):
        with self._lock:
            self.validate_busses(self.active_busses_staging)
            self.validate_busses(self.active_busses)

        self.validate_specific_valid_arrivals(logger)
        self.remove_specific_invalid_arrivals(logger)

    def validate_busses(self, active_busses):
        bus_id_to_remove = []
        for bus_id, busses in active_busses.items():
            busses_to_remove = []
            i = 0
            for bus in busses:
                if bus.purge():
                    busses_to_remove.append(i)
                    bus_item = (
                        bus.service,
                        bus.origin_id,
                        bus.terminus_id,
                        bus_id,
                        bus.journey_count,
                    )

                    if bus.terminus_id in bus.visited_locations:
                        self.arrivals_to_validate.add(bus_item)
                    else:
                        self.arrivals_to_remove.add(bus_item)
                i = i + 1

            if busses_to_remove:
                for index in sorted(busses_to_remove, reverse=True):
                    busses.pop(index)

            if not busses:
                bus_id_to_remove.append(bus_id)

        if bus_id_to_remove:
            for bus_id in bus_id_to_remove:
                active_busses.pop(bus_id, None)
