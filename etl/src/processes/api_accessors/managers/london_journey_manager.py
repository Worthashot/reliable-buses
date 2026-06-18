"""
Created on Sun Dec 21 16:39:54 2025

@author: Cameron
"""

##To be ran once a day
# lookup API url to get all routes that have been created, or modified, since the last lookup
#   "https://api.tfl.gov.uk/Line/Mode/bus/Route?serviceTypes=Regular"
#   if a route has been flaged, lookup API url for details
#       "https://api.tfl.gov.uk/Line/[lineNumber]/Route/Sequence/all?serviceTypes=Regular&excludeCrowding=true"
# store inactive routes into database as is
# for all flagged  active routes, check names against each other
#   if 2 active routes share the same name, check the timetable and deactivate the route that matches least
#   "https://api.tfl.gov.uk/Line/{id}/Timetable/{fromStopPointId}"
#       also, if more matching route is new, store it and activate it in database
#           if neither route matches, send email for manual inspection
#   if new active route is different in name to all active routes, check it exists and if so add it
#       if it doesnt exist, send a notification for manual inspection
#   If a route from the route/sequence API doesn't match any from the Line/Mode API, save it and send a notification
# Make sure to have the list of active stopID in memory
# disable any inactive routes
import pickle
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import dateutil.parser
import pandas as pd

from .api_manager import APIManager


class LondonJourneyManager:
    def __init__(
        self,
        db_url,
        bus_project_api_key,
        tfl_api_key,
        unuploaded_cache_db_location,
        inactive_cache_db_location,
    ):
        self.db_url = db_url
        self.bus_project_api_key = bus_project_api_key
        self.tfl_api_key = tfl_api_key


        self._init_db(unuploaded_cache_db_location, inactive_cache_db_location)
        self.api_manager = APIManager()
        # self.test_df_1 = pd.DataFrame()
        # self.test_df_2 = pd.DataFrame()
        # self.test_df_3 = pd.DataFrame()


    def _init_db(self, unuploaded_cache_db_location, inactive_cache_db_location):
        database_name = "journeysLondonBasicUnuploadedCache.db"
        file_path = Path.cwd() / unuploaded_cache_db_location
        Path(file_path).mkdir(parents=True, exist_ok=True)
        self.unuploaded_cache_db_location = file_path / database_name
        with sqlite3.connect(self.unuploaded_cache_db_location, timeout=10) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS journeysLondonBasicUnuploadedCache (
                    id INTEGER PRIMARY KEY,
                    batch BLOB,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            conn.execute("PRAGMA journal_mode=WAL")


        database_name = "journeysLondonBasicInactiveCache.db"
        file_path = Path.cwd() / inactive_cache_db_location
        Path(file_path).mkdir(parents=True, exist_ok=True)
        self.inactive_cache_db_location = file_path / database_name
        with sqlite3.connect(self.inactive_cache_db_location, timeout=10) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS journeysLondonBasicInactiveCache (
                    id INTEGER PRIMARY KEY,
                    batch BLOB,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            conn.execute("PRAGMA journal_mode=WAL")

    # The main function
    # lookup the list of routes
    # find all updated routes
    # find the valid list of stops for these routes
    # store these new values into the database
    # update the live list of journeys from the database
    def update_journeys(self, logger):
        url = "https://api.tfl.gov.uk/Line/Mode/bus/Route?serviceTypes=Regular"
        headers = {
            # Request headers
            "Cache-Control": "no-cache",
            "app_key": self.tfl_api_key,
        }

        try:
            r, _attempts = self.api_manager.get_api(url, headers, logger)
        except Exception as e:
            logger.exception(
                "High error, unable to lookup TFL API for journey change. "
                + "\nError: "
                + repr(e)
                + "will proceed using previous "
                + "valid journies. If a route passes an unexpected stop, data will not be usable for this day."
            )
            subject = "LondonJourneyManager High Error : " + repr(e)
            details = (
                "High error, unable to get today's journeys from TFL API. Will proceed using previous "
                + "valid journeys. If a route passes an unexpected stop, data will not be usable for this day."
            )
            self.api_manager.send_error_message(self.db_url, self.bus_project_api_key, subject, details, logger)
            return
        data = r.json()
        logger.info("fetching previous jounreys")
        to_check_df = self.find_updated_journeys(data, logger)

        # XXX
        # self.test_df_1 = to_check_df.copy()

        logger.info("matching new possible journeys against stopoints")
        to_check_df = self.check_journeys_routes(to_check_df, logger)

        logger.info("matching new missing journeys against timetable")
        to_check_df = self.check_journeys_timetable(to_check_df, logger)
        logger.info("matching new missing journeys against orderd line routes")
        to_check_df = self.check_journeys_line_routes(to_check_df, logger)

        # XXX
        # self.test_df_2 = to_check_df.copy()

        # Todo
        # Have API ping when this is non-empty
        logger.info("logging missing journeys")
        unavailable_routes_relevent_dataframe = to_check_df.loc[
            (to_check_df["stop_list"] == "")
        ]
        if not unavailable_routes_relevent_dataframe.empty:
            logger.warning(
                "Warning when creating dataframe for routes, some routes unabailable"
            )
            subject = "LondonJourneyManager Minor Error: unavailable routes"
            details = (
                "A JSON of the dataframe of unavailable routes\n"
                + unavailable_routes_relevent_dataframe.to_json()
            )
            self.api_manager.send_error_message(self.db_url, self.bus_project_api_key, subject, details, logger)

        filled_df = to_check_df.loc[to_check_df["stop_list"] != ""]

        logger.info("storing valid dataframe to database")
        filled_df["is_active"] = 1
        filled_df = filled_df.drop_duplicates(
            subset=["service", "origin_id", "destination_id", "stop_list"]
        )
        s = filled_df.groupby(["service", "origin_id", "destination_id"]).cumcount()
        filled_df["count"] = s.astype(str)
        filled_df["validated"] = 1
        filled_df["route_section_name"] = (
            filled_df["service"]
            + ":"
            + filled_df["origin"]
            + " - "
            + filled_df["destination"]
            + ":"
            + s.astype(str)
        )

        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }

        chunk_size = 50

        url = self.db_url + "/basic/journeys_flag_inactive"
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        data_input = []
        try:
            r, _attempts = self.api_manager.post_api(url, headers, logger, data_input)
        except Exception as e:
            logger.exception(
                f"Figh error, unable to flag basic_table to be set inactive at {url}."
                + "Error: "
                + repr(e)
            )
            subject = "LondonJourneyManager High Error : " + repr(e)
            details = (
                "high error, unable to flag journeys inactive  as for Project API. Will proceed using previous "
                + "valid journeys. If a route passes an unexpected stop, data will not be usable for this day."
            )
            self.api_manager.send_error_message(self.db_url, self.bus_project_api_key, subject, details, logger)
            return

        # XXX
        # self.test_df_3 = filled_df.copy()

        yes_count = 0
        yes_length = 0
        no_count = 0
        no_length = 0
        for i in range(0, len(filled_df), chunk_size):
            chunk = filled_df.iloc[i : i + chunk_size]
            data = chunk.to_json(orient="records")
            url = self.db_url + "/basic/new_journeys"
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i // chunk_size + 1} failed: {e!r}")
                self.write_to_cache(data, "unuploaded", logger)
                no_count = no_count + 1
                no_length = no_length + len(data)
            # print(f"✓ Chunk {i//chunk_size + 1} uploaded")
            yes_count = yes_count + 1
            yes_length = yes_length + len(data)

            # url = self.db_url + "/basic/set_active"
            # response, attempts = self.api_manager.postAPI(url, headers, data)
            # if response.status_code in [200, 201] and attempts<=5:
            #    print(f"✓ Chunk {i//chunk_size + 1} activated")
            # else:
            #    print(f"✗ Chunk {i//chunk_size + 1} failed to activate: {response.status_code}")
            #    self.write_to_cache(data, "inactive", logger)
            #

        logger.info(f"\nUploaded {yes_length} records in {yes_count} chunks")
        logger.info(f"\nFailed to upload {no_length} records in {no_count} chunks")

        url = self.db_url + "/basic/journeys_set_inactive"
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        data_input = []
        try:
            r, _attempts = self.api_manager.post_api(url, headers, logger, data_input)
        except Exception as e:
            logger.warning(
                f"Minor error, unable to set basic_table to inactive at {url}."
                + "Error: "
                + repr(e)
            )
            subject = "LondonJourneyManager Minor Error : Cannot access Project API"
            details = (
                "Minor error, unable to set flagged journeys inactive for Project API. ArrivalManager will not create a journey dataframe until all flagged "
                + "journeys are set inactive, which is a check it will do periodically."
            )
            self.api_manager.send_error_message(self.db_url, self.bus_project_api_key, subject, details, logger)
            return

    # takes the dataframe from recorded journeys and matches this against the list of journeys from today
    # returns a dataframe where the relevant journeys are merged, and new ones are created
    # also stores a unique name for all entries of the form [service:origin - destination:occurrences]
    def find_updated_journeys(self, data, logger):
        services_to_lookup = []
        new_database_entries = []

        for route in data:
            item = {}
            services_to_lookup.append(route["name"])
            item["service"] = route["name"]
            item["date_added"] = dateutil.parser.parse(route["created"]).timestamp()
            item["date_modified"] = dateutil.parser.parse(route["modified"]).timestamp()
            for route_sections in route["routeSections"]:
                route_section_name = route_sections["name"]
                origin = route_section_name.split(" - ")[0].strip()
                origin_id = route_sections["originator"]
                destination = route_section_name.split(" - ")[1].strip()
                destination_id = route_sections["destination"]

                item["route_section_name"] = route_section_name
                item["route_section_id"] = origin_id + ":" + destination_id
                item["origin"] = origin
                item["origin_id"] = origin_id
                item["destination"] = destination
                item["destination_id"] = destination_id
                item["direction"] = route_sections["direction"]
                item["valid_from"] = dateutil.parser.parse(
                    route_sections["validFrom"]
                ).timestamp()
                item["valid_to"] = dateutil.parser.parse(
                    route_sections["validTo"]
                ).timestamp()
                item["validated"] = 0
                new_database_entries.append(item.copy())

        df2 = pd.DataFrame(new_database_entries)
        df2["date_modified"] = df2["date_modified"].astype(int)
        created_time = time.time()
        df2["entry_created_at"] = created_time

        url = self.db_url + "/journeys/table"
        headers = {"x-api-key": self.bus_project_api_key}
        error_flag = False
        try:
            r, _attempts = self.api_manager.get_api(url, headers, logger)
        except Exception as e:
            logger.exception(
                f"High error, unable to lookup Project API for previous journeys at {url}."
                + " Error: "
                + repr(e)
                + " Will create new database of journeys for today not consistant with established journeys"
            )
            subject = "LondonJourneyManager High Error : " + repr(e)
            details = (
                f"High error, unable to lookup Project API for previous journeys at {url}."
                + " Will create new database of journeys for today not consistant with established journeys"
            )
            self.api_manager.send_error_message(self.db_url, self.bus_project_api_key, subject, details, logger)
            df1 = pd.DataFrame()
            error_flag = True
        else:
            df1 = pd.DataFrame(r.json())
        if df1.empty:
            # TODO May be think about how this data will be stored to match up with long term data
            df2["stop_list"] = ""
            df2["count"] = None
            if error_flag:
                return df2
            subject = "LondonJourneyManager High Error : old journey list is empty"
            details = (
                "High error, old lookup of Project API returns an empty list"
                + " Will create new database of journeys for today not consistant with established journeys"
            )
            self.api_manager.send_error_message(self.db_url, self.bus_project_api_key, subject, details, logger)

            return df2

        key_cols = ["service", "origin_id", "destination_id", "date_modified"]
        # merged = pd.merge(df1[key_cols], df2[key_cols],
        #          on=key_cols, how='left', indicator=True)

        df2_no_match = df2[
            ~df2[key_cols]
            .apply(lambda row: tuple(row), axis=1)
            .isin(df1[key_cols].apply(lambda row: tuple(row), axis=1))
        ]

        df2_no_match_with_missing_key = df2_no_match.copy()
        df2_no_match_with_missing_key["stop_list"] = ""
        df2_no_match_with_missing_key["count"] = None
        df2_no_match_with_missing_key = df2_no_match_with_missing_key[df1.columns]
        return pd.concat([df1, df2_no_match_with_missing_key], ignore_index=True)

    def check_journeys_routes(self, updated_journeys_df, logger):
        services = set(
            updated_journeys_df.loc[(updated_journeys_df["stop_list"] == ""), "service"]
        )
        if services:
            for service in services:
                url = (
                    "https://api.tfl.gov.uk/Line/"
                    + service
                    + "/Route/Sequence/all?serviceTypes=Regular&excludeCrowding=true"
                )
                headers = {
                    # Request headers
                    "Cache-Control": "no-cache",
                    "app_key": self.tfl_api_key,
                }
                try:
                    r, _attempts = self.api_manager.get_api(url, headers, logger)
                except Exception:
                    continue
                data = r.json()
                for sequence in data["stopPointSequences"]:
                    origin = sequence["stopPoint"][0]["name"]
                    destination = sequence["stopPoint"][-1]["name"]
                    stop_list = ",".join([s["id"] for s in sequence["stopPoint"]])
                    updated_journeys_df = self.update_journey(
                        updated_journeys_df,
                        origin,
                        destination,
                        service,
                        stop_list,
                        logger,
                    )

        return updated_journeys_df

    def check_journeys_timetable(self, updated_journeys_df, logger):

        time_table_lookup = updated_journeys_df.loc[
            (updated_journeys_df["stop_list"] == ""),
            ["service", "origin_id", "destination_id"],
        ].values.tolist()
        if time_table_lookup:
            for t in time_table_lookup:
                service = str(t[0])
                origin_id = str(t[1])
                destination_id = str(t[2])
                url = (
                    "https://api.tfl.gov.uk/Line/"
                    + service
                    + "/Timetable/"
                    + origin_id
                    + "/to/"
                    + destination_id
                )
                headers = {
                    # Request headers
                    "Cache-Control": "no-cache",
                    "app_key": self.tfl_api_key,
                }

                try:
                    r, _attempts = self.api_manager.get_api(url, headers, logger)
                except Exception:
                    continue
                data = r.json()
                stop_sequence = ",".join([s["id"] for s in data["stops"]])
                updated_journeys_df = self.update_journey(
                    updated_journeys_df,
                    origin_id,
                    destination_id,
                    service,
                    stop_sequence,
                    logger,
                    is_id=True,
                )

        return updated_journeys_df

    def check_journeys_line_routes(self, updated_journeys_df, logger):
        services = set(
            updated_journeys_df.loc[(updated_journeys_df["stop_list"] == "")]["service"]
        )
        if services:
            for service in services:
                url = (
                    "https://api.tfl.gov.uk/Line/"
                    + service
                    + "/Route/Sequence/all?serviceTypes=Regular&excludeCrowding=true"
                )
                headers = {
                    # Request headers
                    "Cache-Control": "no-cache",
                    "app_key": self.tfl_api_key,
                }
                try:
                    r, _attempts = self.api_manager.get_api(url, headers, logger)
                except Exception:
                    continue
                data = r.json()
                for line_route in data["orderedLineRoutes"]:
                    name = line_route["name"]
                    name = self.api_journey_name_formater(name)
                    origin = name.split(" - ")[0]
                    destination = name.split(" - ")[1]
                    stop_list = ",".join(line_route["naptanIds"])
                    updated_journeys_df = self.update_journey(
                        updated_journeys_df,
                        origin,
                        destination,
                        service,
                        stop_list,
                        logger,
                    )

        return updated_journeys_df

    def update_journey(
        self,
        updated_journeys_df,
        origin,
        destination,
        service,
        stop_list,
        logger,
        is_id=False,
    ):
        if is_id:
            o = "origin_id"
            d = "destination_id"
        else:
            o = "origin"
            d = "destination"

        existing_journey_mask = (
            (updated_journeys_df[o] == origin)
            & (updated_journeys_df[d] == destination)
            & (updated_journeys_df["service"] == service)
            & (updated_journeys_df["stop_list"] != "")
        )

        if existing_journey_mask.all():
            logger.warning(
                f"no space allocated for repeated journey \n {o} : {origin}\n{d} : {destination}\nservice : {service}"
            )
        else:
            empty_row_mask = (
                (updated_journeys_df[o] == origin)
                & (updated_journeys_df[d] == destination)
                & (updated_journeys_df["service"] == service)
                & (updated_journeys_df["stop_list"] == "")
            )
            empty_rows = updated_journeys_df[empty_row_mask]
            if len(empty_rows) > 0:
                idx_to_update = empty_rows.index[0]
                updated_journeys_df.loc[idx_to_update, "stop_list"] = stop_list
            else:
                logger.warning(
                    f"No empty slot found for journey: {origin}->{destination} ({service})"
                )
        return updated_journeys_df

    def retry_cache(self, logger):
        data_size = 50
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        unuploaded_data = self.pop_all("unuploaded", logger)
        if unuploaded_data is None:
            return
        i = 0
        j = 0
        yes_length = 0
        no_length = 0
        for data in unuploaded_data:
            url = self.db_url + "/basic/new_journeys"
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i + j} failed to upload: {e!r}")
                self.write_to_cache(data, "inactive", logger)
                j = j + 1
                no_length = no_length + len(data)
                continue
            # print(f"✓ Chunk {i//data_size + 1} activated")
            i = i + 1
            yes_length = yes_length + len(data)

        logger.info(f"\nUploaded {yes_length} records in {i} chunks")
        logger.info(f"\nFailed to upload {no_length} records in {j} chunks")

        inactive_data = self.pop_all("inactive", logger)
        if inactive_data is None:
            return
        i = 0
        for data in inactive_data:
            url = self.db_url + "/basic/set_active"
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(
                    f"✗ Chunk {i // data_size + 1} failed to activate: {e!r}"
                )
                self.write_to_cache(data, "inactive", logger)
            logger.info(f"✓ Chunk {i // data_size + 1} activated")

            i = i + 1

    def write_to_cache(self, batch_data, cache_type, logger):
        if cache_type == "unuploaded":
            with sqlite3.connect(self.unuploaded_cache_db_location, timeout=10) as conn:
                conn.execute(
                    "INSERT INTO journeysLondonBasicUnuploadedCache (batch) VALUES (?)",
                    (pickle.dumps(batch_data),),
                )
        elif cache_type == "inactive":
            with sqlite3.connect(self.inactive_cache_db_location, timeout=10) as conn:
                conn.execute(
                    "INSERT INTO journeysLondonBasicInactiveCache (batch) VALUES (?)",
                    (pickle.dumps(batch_data),),
                )
        else:
            logger.warning("wrong name dummy " + cache_type)

    def pop_all(self, cache_type, logger):
        """Retrieve and remove all batches (for retry)."""
        if cache_type == "unuploaded":
            with sqlite3.connect(self.unuploaded_cache_db_location, timeout=10) as conn:
                cur = conn.execute(
                    "SELECT id, batch FROM journeysLondonBasicUnuploadedCache"
                )
                rows = cur.fetchall()
                if rows:
                    conn.execute("DELETE FROM journeysLondonBasicUnuploadedCache")
                batches = [pickle.loads(row[1]) for row in rows]
            return batches  # noqa: RET504
        if cache_type == "inactive":
            with sqlite3.connect(self.inactive_cache_db_location, timeout=10) as conn:
                cur = conn.execute(
                    "SELECT id, batch FROM journeysLondonBasicInactiveCache"
                )
                rows = cur.fetchall()
                if rows:
                    conn.execute("DELETE FROM journeysLondonBasicInactiveCache")
                batches = [pickle.loads(row[1]) for row in rows]
            return batches  # noqa: RET504
        logger.warning("wrong name dummy " + cache_type)
        return []

    def create_journey_name(self, route_name, origin, destination):
        return (
            str(route_name.strip())
            + ":"
            + str(origin.strip())
            + " - "
            + str(destination.strip())
        )

    def api_to_datetime(self, time):
        date_format = "%Y-%m-%d %H:%M:%S.%fZ"
        formatted_date = time.replace("T", " ")
        return datetime.strptime(formatted_date, date_format).astimezone(
            ZoneInfo("Europe/London")
        )

    def api_journey_name_formater(self, api_name):
        name = [x.strip() for x in api_name.split("&harr;")]
        return name[0] + " - " + name[-1]
