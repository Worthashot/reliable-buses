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
        journey_manager.UpdateJourneys(logger)
        logger.info("journey_manager.UpdateJourneys() completed")
        if process_shutdown_event.is_set():
            logger.info("Process shutdown recieved, terminating")
            return
        stop_manager.download_stops_csv(logger)
        logger.info("StopsManager.download_stops_csv() completed")
        if process_shutdown_event.is_set():
            logger.info("Process shutdown recieved, terminating")
            return
        stop_manager.updateDailyStops(logger)
        logger.info("StopsManager.updateDailyStops() completed")

    except Exception as e:
        logger.exception("Critical Error in daily_update_long_process:\n" + repr(e))
        url = bus_project_url + "/mail/send_error_email"
        headers = {"x-api-key": bus_project_key}
        subject = "daily_update_long_process Critical Error :" + repr(e)
        details = (
            "Critical Error in daily_update_long_process:\n"
            + repr(e)
            + "\n"
            + "program should restart from scratch."
        )
        try:
            api_manager.post_error(url, headers, subject, details, logger)
        except Exception as e2:
            logger.exception("High Error, unable to mail error.\n" + repr(e2))
        error_queue.put(e)
        raise
