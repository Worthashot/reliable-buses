"""
Created on Sun Jun  7 15:05:44 2026

@author: Cameron
"""

from .api_accessors.managers.api_manager import APIManager
from .process_utility import setup_process_logging


def daily_update_long_process(
    process_shutdown_event,
    journey_manager,
    stop_manager,
    bus_project_url,
    bus_project_key,
    error_queue,
):
    api_manager = APIManager()
    logger = setup_process_logging()
    logger.info("Started daily_update_long_process process")
    try:
        journey_manager.update_journeys(logger)
        logger.info("journey_manager.update_journeys() completed")
        if process_shutdown_event.is_set():
            logger.info("Process shutdown recieved, terminating")
            return
        stop_manager.download_stops_csv(logger)
        logger.info("StopsManager.download_stops_csv() completed")
        if process_shutdown_event.is_set():
            logger.info("Process shutdown recieved, terminating")
            return
        stop_manager.update_daily_stops(logger)
        logger.info("StopsManager.update_daily_stops() completed")

    except Exception as e:
        logger.exception("Critical Error in daily_update_long_process:\n" + repr(e))
        subject = "daily_update_long_process Critical Error :" + repr(e)
        details = (
            "Critical Error in daily_update_long_process:\n"
            + repr(e)
            + "\n"
            + "program should restart from scratch."
        )
        api_manager.send_error_message(bus_project_url, bus_project_key, subject, details, logger)
        error_queue.put(e)
        raise
