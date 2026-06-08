"""
Created on Tue Jan  6 15:25:09 2026

@author: Cameron
"""

# This is responsible for updating the stops_basic.db with all bus stops currently being used that day. It does this by
# reading the list of all stops from the journey_basic.db made by LondonJourneyManager, and filling in
# data from the csv of all national stops.

# download NaPTAN with API 'https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv'
# any id not in the csv can be looked up with API
# "https://api.tfl.gov.uk/StopPoint/{StopId}"
import pickle
import sqlite3
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests
from pandas import DataFrame

from .api_manager import APIManager


class LondonStopManager:
    def __init__(
        self,
        database_url,
        bus_project_api_key,
        stop_csv_url,
        stop_csv_location,
        tfl_api_key,
        cache_db_location,
    ):
        self.batch_size = 10000
        self.database_url = database_url
        self.stop_csv_url = stop_csv_url
        self.stop_csv_location = stop_csv_location
        self.last_lookup = datetime.fromtimestamp(0, ZoneInfo("Europe/London"))
        self.bus_project_api_key = bus_project_api_key
        self.tfl_api_key = tfl_api_key
        self.cache_db_location = cache_db_location
        self._init_db()
        self.api_manager = APIManager()

    def _init_db(self):
        with sqlite3.connect(self.cache_db_location, timeout=10) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS stopsLondonBasicCache (
                    id INTEGER PRIMARY KEY,
                    batch BLOB,
                    retry_count INTEGER DEFAULT 0
                )
            """)
            conn.execute("PRAGMA journal_mode=WAL")

    def download_stops_csv(self, logger):
        filename = "stops.csv"
        try:
            # Create the target directory if it doesn't exist
            Path(self.stop_csv_location).mkdir(parents=True, exist_ok=True)

            # Full path for the output file
            file_path = Path(self.stop_csv_location) / filename

            # Send GET request to the API (stream=True for large files)
            with requests.get(self.stop_csv_url, stream=True) as response:
                response.raise_for_status()  # Raise an error for bad status codes

                # Write the content to the file in binary mode
                with Path(file_path).open("wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)

            logger.info(f"File successfully downloaded to: {file_path}")
            return True

        except requests.exceptions.RequestException as e:
            logger.exception(f"Error downloading the file: {e!r}")
            return False
        except OSError as e:
            logger.exception(f"Error writing the file: {e!r}")
            return False

    def update_daily_stops(self, logger):
        try:
            new_stop_info, unseen_stops = self.examine_stops_csv(logger)
        except Exception:
            return

        _dates = pd.to_datetime(new_stop_info["ModificationDateTime"])

        unseen_stop_info = self.examine_unseen_stops(unseen_stops, logger)
        todays_stop_info = pd.concat(
            [new_stop_info, unseen_stop_info], ignore_index=True
        )
        todays_stop_info["ModificationDateTime"] = pd.to_numeric(
            todays_stop_info["ModificationDateTime"]
        )

        url = self.database_url + "/basic/new_stops"
        headers = {
            "x-api-key": self.bus_project_api_key,
            "Content-Type": "application/json",
        }
        chunk_size = 50
        yes_count = 0
        yes_length = 0
        no_count = 0
        no_length = 0
        self.unuploaded_chunks = []
        for i in range(0, len(todays_stop_info), chunk_size):
            chunk = todays_stop_info.iloc[i : i + chunk_size]
            data = chunk.to_json(orient="records")
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i // chunk_size + 1} failed: {e!r}")
                no_length = no_length + len(chunk)
                no_count = no_count + 1
                self.write_to_cache(data)
                continue

            yes_length = yes_length + len(chunk)
            yes_count = yes_count + 1

        logger.info(f"\nUploaded {yes_length} records in {yes_count} chunks")
        logger.info(f"\nFailed to upload {no_length} records in {no_count} chunks")

        return

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
            url = self.database_url + "/basic/new_stops"
            try:
                _response, _attempts = self.api_manager.post_api(
                    url, headers, logger, data
                )
            except Exception as e:
                logger.warning(f"✗ Chunk {i + j} failed to activate: {e!r}")
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
                "INSERT INTO stopsLondonBasicCache (batch) VALUES (?)",
                (pickle.dumps(batch_data),),
            )

    def pop_all(self):
        """Retrieve and remove all batches (for retry)."""
        with sqlite3.connect(self.cache_db_location, timeout=10) as conn:
            cur = conn.execute("SELECT id, batch FROM stopsLondonBasicCache")
            rows = cur.fetchall()
            if rows:
                conn.execute("DELETE FROM stopsLondonBasicCache")
            batches = [pickle.loads(row[1]) for row in rows]
        return batches  # noqa: RET504

    def examine_stops_csv(self, logger) -> tuple[DataFrame, list[str]]:
        headers = {"x-api-key": self.bus_project_api_key}
        url = self.database_url + "/basic/active_journeys"
        try:
            request, _attempts = self.api_manager.get_api(url, headers, logger)
        except Exception as e:
            logger.exception(
                "High error, "
                + repr(e)
                + "\n unable to lookup API for today's journeys. will proceed using previous "
                + "valid stops. If a route passes an unexpected stop, data will not be usable until stops are updated."
            )
            url = self.database_url + "/mail/send_error_email"
            headers = {"x-api-key": self.bus_project_api_key}
            subject = "LondonStopManager - High Error : " + repr(e)
            details = (
                "High error, unable to lookup database API for today's journeys. Will proceed using previous "
                + "valid stops. If a route passes an unexpected stop, data will not be usable until stops are updated."
            )
            try:
                self.api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            raise

        try:
            df = pd.DataFrame(request.json())["stop_list"]
        except Exception as e:
            url = self.database_url + "/mail/send_error_email"
            headers = {"x-api-key": self.bus_project_api_key}
            subject = "LondonStopManager High Error : cannot use dataframe"
            details = (
                "High error, unable find todays stop_list journeys. Will proceed using previous "
                + "valid stops. If a route passes an unexpected stop, data will not be usable until stops are updated."
                + "Error "
                + repr(e)
                + "."
            )
            try:
                self.api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            raise

        stop_list = list(set((",".join(list(df))).split(",")))
        active_stops = pd.DataFrame(stop_list)
        stop_list = []
        batch_iterator = pd.read_csv(
            self.stop_csv_location + "/stops.csv", chunksize=self.batch_size
        )
        new_stop_info = []
        unseen_stops = []
        for batch in batch_iterator:
            mask_seen = batch["ATCOCode"].isin(active_stops[0])
            daily_stop_info = batch[mask_seen]

            batch_stop_info = daily_stop_info[
                pd.to_datetime(daily_stop_info["ModificationDateTime"], format="mixed")
                >= self.last_lookup
            ]
            batch_stop_info["ModificationDateTime"] = (
                pd.to_datetime(
                    batch_stop_info["ModificationDateTime"], format="mixed"
                ).astype("int64")
                // 10**6
            )
            batch_stop_info = batch_stop_info[
                [
                    "ATCOCode",
                    "CommonName",
                    "Longitude",
                    "Latitude",
                    "ModificationDateTime",
                ]
            ]
            new_stop_info.append(batch_stop_info)

            mask_unseen = ~active_stops[0].isin(batch["ATCOCode"])
            unseen_stops = unseen_stops + list(active_stops[mask_unseen][0])

        return pd.concat(new_stop_info, ignore_index=True), unseen_stops

    # and stops that have an ID registered to be arrived, but no entry in the big ol' csv with stops in it get
    # checked from the TFL API.
    # Modification time is not available here, so once an ID is registered, it will remain regardless of modifications.
    # As there is only 1 out of about 30,000 stops that this seems to apply to, it feels unlikely checking this
    # stop for modification will be frequent, but you never know
    def examine_unseen_stops(self, unseen_stops, logger):
        unseen_values = {
            "ATCOCode": [],
            "CommonName": [],
            "Longitude": [],
            "Latitude": [],
            "ModificationDateTime": [],
        }
        for stop in unseen_stops:
            url = "https://api.tfl.gov.uk/StopPoint/" + stop
            headers = {
                # Request headers
                "Cache-Control": "no-cache",
                "app_key": self.tfl_api_key,
            }
            try:
                r, _attempts = self.api_manager.get_api(url, headers, logger)
            except Exception as e:
                logger.warning(
                    "error, in lookup for stopId"
                    + stop
                    + ".\nError :"
                    + repr(e)
                    + "\nStoring ID with blank data."
                )
                unseen_values["ATCOCode"].append(stop)
                unseen_values["CommonName"].append("")
                unseen_values["Longitude"].append("")
                unseen_values["Latitude"].append("")
                unseen_values["ModificationDateTime"].append("0")
                continue
            data = r.json()
            unseen_values["ATCOCode"].append(stop)
            unseen_values["CommonName"].append(data["commonName"])
            unseen_values["Longitude"].append(data["lon"])
            unseen_values["Latitude"].append(data["lat"])
            unseen_values["ModificationDateTime"].append("0")

        return pd.DataFrame(unseen_values)
