"""
Created on Sun Jun  7 14:31:48 2026

@author: Cameron
"""

import mmap
from multiprocessing import Queue
from pathlib import Path
from queue import Empty


def drain_queue(q: Queue):
    """Remove and return all items currently in the queue."""
    items = []
    while True:
        try:
            items.append(q.get_nowait())
        except Empty:
            break
    return items


def get_memory_usage():
    with Path("/proc/self/statm").open() as f:
        fields = f.read().split()
        rss_pages = int(fields[1])
        page_size = mmap.PAGESIZE
        return rss_pages * page_size


class InvalidEnvironmentVariablesError(Exception):
    pass


def verify_environment_variables(
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
    logger,
) -> tuple[str, str, str, str, str, str, str, str, str, str]:

    if not isinstance(bus_project_url, str):
        logger.exception(
            "Critical Error in verify_environment_variables: BUS_PROJECT_URL is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError("BUS_PROJECT_URL is not a string")

    if not isinstance(bus_project_key, str):
        logger.exception(
            "Critical Error in verify_environment_variables: BUS_PROJECT_KEY is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError("BUS_PROJECT_KEY is not a string")

    if not isinstance(tfl_url, str):
        logger.exception(
            "Critical Error in verify_environment_variables: TFL_URL is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError("TFL_URL is not a string")

    if not isinstance(tfl_key, str):
        logger.exception(
            "Critical Error in verify_environment_variables: TFL_KEY is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError("TFL_KEY is not a string")

    if not isinstance(stop_csv_url, str):
        logger.exception(
            "Critical Error in verify_environment_variables: STOP_CSV_URL is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError("STOP_CSV_URL is not a string")

    if not isinstance(stop_csv_location, str):
        logger.exception(
            "Critical Error in verify_environment_variables: STOP_CSV_LOCATION is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError("STOP_CSV_LOCATION is not a string")

    if not isinstance(journeys_basic_unuploaded_cache_location, str):
        logger.exception(
            "Critical Error in verify_environment_variables: JOURNEYS_BASIC_UNUPLOADED_CACHE_LOCATION is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError(
            "JOURNEYS_BASIC_UNUPLOADED_CACHE_LOCATION is not a string"
        )

    if not isinstance(journeys_basic_inactive_cache_location, str):
        logger.exception(
            "Critical Error in verify_environment_variables: JOURNEYS_BASIC_INACTIVE_CACHE_LOCATION is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError(
            "JOURNEYS_BASIC_INACTIVE_CACHE_LOCATION is not a string"
        )

    if not isinstance(stops_basic_cache_location, str):
        logger.exception(
            "Critical Error in verify_environment_variables: STOPS_BASIC_CACHE_LOCATION is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError(
            "STOPS_BASIC_CACHE_LOCATION is not a string"
        )

    if not isinstance(timetables_basic_cache_location, str):
        logger.exception(
            "Critical Error in verify_environment_variables: TIMETABLES_BASIC_CACHE_LOCATION is not a valid string\n"
            + "Check environment variables and restart."
        )
        raise InvalidEnvironmentVariablesError(
            "TIMETABLES_BASIC_CACHE_LOCATION is not a string"
        )

    return (
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
    )
