"""
Created on Mon Feb 23 16:33:42 2026

@author: Cameron
"""

import json
import pickle
import sqlite3
from pathlib import Path

from .api_manager import APIManager


class LondonTimetableManager:
    def __init__(
        self, database_url, bus_project_api_key, tfl_api_key, cache_db_location
    ):
        self.database_url = database_url
        self.bus_project_api_key = bus_project_api_key
        self.tfl_api_key = tfl_api_key
        self._init_db(cache_db_location)
        self.api_manager = APIManager()

    def _init_db(self, cache_db_location):
        database_name = "timetablesLondonBasicCache.db"
        file_path = Path.cwd() / cache_db_location
        Path(file_path).mkdir(parents=True, exist_ok=True)
        self.cache_db_location = file_path / database_name
        with sqlite3.connect(self.cache_db_location, timeout=10) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS timetablesLondonBasicCache (
                    id INTEGER PRIMARY KEY,
                    batch BLOB,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            conn.execute("PRAGMA journal_mode=WAL")

    def daily_timetable_check(self, logger):
        url = self.database_url + "/basic/daily_services"
        headers = {"x-api-key": self.bus_project_api_key}
        logger.info("Looking up TFL API")
        try:
            r, _attempts = self.api_manager.get_api(url, headers, logger)
        except Exception as e:
            logger.exception(
                f"High error, unable to lookup Project API for daily_services at {url}."
                + " Unable to find timetables for today\n"
                + "Error: "
                + repr(e)
            )
            url = self.database_url + "/mail/send_error_email"
            headers = {"x-api-key": self.bus_project_api_key}
            subject = "LondonTimetableManager High Error : " + repr(e)
            details = (
                f"High error, unable to lookup Project API for daily_services at {url}."
                + " Unable to find timetables for today"
            )
            try:
                self.api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            return
        logger.info("TFL API searched. Looping over available services.")
        data = r.json()
        r = []
        items = []
        for d in data:
            service = d["service"]
            origin_id = d["origin_id"]
            destination_id = d["destination_id"]
            count = d["count"]
            # self.tfl_api_key + "/Line/" + service +
            url = "https://api.tfl.gov.uk/Line/" + service + "/Timetable/" + origin_id
            headers = {
                # Request headers
                "Cache-Control": "no-cache",
                "app_key": self.tfl_api_key,
            }
            try:
                r, _attempts = self.api_manager.get_api(url, headers, logger)
            except Exception as e:
                logger.warning("unable to access api : " + repr(e))
                continue
            item = {}
            data2 = r.json()
            try:
                timetable = data2["timetable"]
                routes = timetable["routes"]
            # todo
            # don't ignore this
            except Exception:
                logger.warning(f"✗ Failed to find timetable for service {service}")
                continue
            logger.info(f"✓ Found timetable for service {service}")
            for route in routes:
                schedules = route["schedules"]
                for schedule in schedules:
                    item["origin_id"] = origin_id
                    item["destination_id"] = destination_id
                    item["count"] = count
                    item["service"] = service
                    item["name"] = schedule["name"]
                    item["is_active"] = 1
                    known_journeys = schedule["knownJourneys"]
                    for known_journey in known_journeys:
                        item["time"] = str(
                            int(known_journey["hour"]) * 60 * 60
                            + int(known_journey["minute"]) * 60
                        )
                        station_intervals = route["stationIntervals"]
                        if len(station_intervals) == 0:
                            logger.warning("error, multiple routes detected")
                            continue
                        for station_interval in station_intervals:
                            intervals = station_interval["intervals"]
                            for interval in intervals:
                                item["stop_id"] = interval["stopId"]
                                items.append(item.copy())

                if len(items) >= 100000:
                    logger.info(
                        f"items size is {len(items)}. Storing timetables to database."
                    )
                    self.update_timetable(items, logger)
                    items = []

    def update_timetable(self, items, logger):
        url = self.database_url + "/basic/new_timetables"
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        chunk_size = 450
        chunks = [items[x : x + chunk_size] for x in range(0, len(items), chunk_size)]
        yes_length = 0
        no_length = 0
        i = 0
        j = 0
        for chunk in chunks:
            data = json.dumps(chunk)
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Timetable chunk {i + j} failed to upload: {e!r}")
                self.write_to_cache(data)
                j = j + 1
                no_length = no_length + len(data)
                continue
            # print(f"✓ Chunk {i} uploaded")
            i = i + 1
            yes_length = yes_length + len(data)

        logger.info(f"\nUploaded {yes_length} timtetable records in {i} chunks")
        logger.info(f"\nFailed to upload {no_length} timetable records in {j} chunks")

    def retry_cache(self, logger):
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }

        all_data = self.pop_all()
        yes_length = 0
        no_length = 0
        i = 0
        j = 0
        for data in all_data:
            url = self.database_url + "/basic/new_timetables"
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i + j} failed to upload: {e!r}")
                self.write_to_cache(data)
                j = j + 1
                no_length = no_length + len(data)
                continue
            # print(f"✓ Chunk {i//data_size + 1} activated")
            i = i + 1
            yes_length = yes_length + len(data)

        logger.info(f"\nUploaded {yes_length} records in {i} chunks")
        logger.info(f"\nFailed to upload {no_length} records in {j} chunks")

    def write_to_cache(self, batch_data):
        with sqlite3.connect(self.cache_db_location, timeout=10) as conn:
            conn.execute(
                "INSERT INTO timetablesLondonBasicCache (batch) VALUES (?)",
                (pickle.dumps(batch_data),),
            )

    def pop_all(self):
        """Retrieve and remove all batches (for retry)."""
        with sqlite3.connect(self.cache_db_location, timeout=10) as conn:
            cur = conn.execute("SELECT id, batch FROM timetablesLondonBasicCache")
            rows = cur.fetchall()
            if rows:
                conn.execute("DELETE FROM timetablesLondonBasicCache")
            batches = [pickle.loads(row[1]) for row in rows]
        return batches  # noqa: RET504
