"""
Created on Sun Jun  7 15:03:25 2026

@author: Cameron
"""

import datetime
import math
import time
from zoneinfo import ZoneInfo

from . import api_accessors as api
from .api_accessors.managers import APIManager
from .process_utility import setup_process_logging


def daily_migrate_process(process_shutdown_event, bus_project_url, bus_project_key):
    """call the API to migrate once every day at 3:00 AM."""
    api_manager = APIManager()
    logger = setup_process_logging()
    logger.info("Started daily_migrate process")
    while not process_shutdown_event.is_set():
        # First, wait until it is time to migrate
        now = datetime.datetime.now(ZoneInfo("Europe/London"))
        target = datetime.datetime.combine(now.date(), datetime.time(3, 0, 0), tzinfo=ZoneInfo("Europe/London"))
        if now >= target:
            target += datetime.timedelta(days=1)
        logger.info(
            f"Next daily_migrate sequence scheduled at {target} (sleeping {(target - now).total_seconds():.0f}s)"
        )
        sleep_seconds = (target - now).total_seconds()
        for _s in range(math.ceil(sleep_seconds)):
            time.sleep(1)
            if process_shutdown_event.is_set():
                break
        if process_shutdown_event.is_set():
            break
        # Before migrating, wait for any validating to finish
        try:
            status = "validating"
            while status == "validating":
                if process_shutdown_event.is_set():
                    break
                logger.info("Checking if API is validating")
                status = api.check_validating(bus_project_url, bus_project_key, logger)
                if process_shutdown_event.is_set():
                    break
                if status == "validating":
                    logger.info("API is validating. sleeping for 5 seconds.")
                    time.sleep(5)
            if process_shutdown_event.is_set():
                break
            if status != "succeeded":
                logger.exception(
                    "Critical Error in daily_migrate_process\nAPI validating status is "
                    + status
                )
                subject = (
                    "daily_migrate_process Critical Error : API validating status is "
                    + status
                )
                details = (
                    "Critical Error in daily_migrate_process:\nAPI validating status is "
                    + status
                    + " Migration of tables not achieved. Cleanup of old tables not achieved. "
                    + "API integrity needs checked. If this continues, may have filesize issues."
                )
                url = bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": bus_project_key}
                try:
                    api_manager.post_error(url, headers, subject, details, logger)
                except Exception as e:
                    logger.exception("High Error, unable to mail error.\n" + repr(e))
                continue

        except Exception as e:
            logger.exception("High Error in daily_migrate_process()\n" + repr(e))
            subject = "daily_migrate_process High Error :" + repr(e)
            details = (
                "High Error in daily_migrate_process:\n"
                + repr(e)
                + "\n"
                + "Migration of tables not achieved. Cleanup of old tables not achieved. "
                + "If this continues, may have filesize issues."
            )
            url = bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": bus_project_key}
            try:
                api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            continue

        # begin migrating
        logger.info("merging basic tables")
        url = bus_project_url + "/migration/daily_migration"
        headers = {"x-api-key": bus_project_key}
        if process_shutdown_event.is_set():
            break
        try:
            _r, _attempts = api_manager.post_api(url, headers, logger)
        except Exception as e:
            logger.exception("High Error in daily_migrate_process()\n" + repr(e))
            subject = "daily_migrate_process High Error :" + repr(e)
            details = (
                "High Error in daily_migrate_process:\n"
                + repr(e)
                + "\n"
                + "Migration of tables not achieved. Cleanup of old tables not achieved. "
                + "If this continues, may have filesize issues."
            )
            url = bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": bus_project_key}
            try:
                api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            continue
        if process_shutdown_event.is_set():
            break
        # wait for migrating to finish
        try:
            status = "migrating"
            while status == "migrating":
                if process_shutdown_event.is_set():
                    break
                logger.info("Checking if API is merging")
                status = api.check_migrating(bus_project_url, bus_project_key, logger)
                if process_shutdown_event.is_set():
                    break
                if status == "migrating":
                    logger.info("API is merging. sleeping for 5 seconds.")
                    time.sleep(5)
            if process_shutdown_event.is_set():
                break
            if status != "succeeded":
                logger.exception(
                    "Critical Error in daily_migrate_process\nAPI migrating status is "
                    + status
                )
                subject = (
                    "daily_migrate_process Critical Error : API migrating status is "
                    + status
                )
                details = (
                    "Critical Error in daily_migrate_process:\nAPI migrating status is "
                    + status
                    + " Migration of tables not achieved. Cleanup of old tables not achieved. "
                    + "API integrity needs checked. If this continues, may have filesize issues."
                )
                url = bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": bus_project_key}
                try:
                    api_manager.post_error(url, headers, subject, details, logger)
                except Exception as e:
                    logger.exception("High Error, unable to mail error.\n" + repr(e))
                continue

        except Exception as e:
            logger.exception(
                "High Error in merging phase of daily_migrate_process()\n" + repr(e)
            )
            subject = "daily_migrate_process High Error in merging phase:" + repr(e)
            details = (
                "High Error in daily_migrate_process in merging phase:\n"
                + repr(e)
                + "\n"
                + "Migration of tables not achieved. Cleanup of old tables not achieved. "
                + "If this continues, may have filesize issues."
            )
            url = bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": bus_project_key}
            try:
                api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            continue

        logger.info("API finished merging")

        # If validation was waiting for migration to finish, it may have started before deletion started. So make
        # sure validation has finished again.
        try:
            status = "validating"
            while status == "validating":
                if process_shutdown_event.is_set():
                    break
                logger.info("Checking if API is validating")
                status = api.check_validating(bus_project_url, bus_project_key, logger)
                if process_shutdown_event.is_set():
                    break
                if status == "validating":
                    logger.info("API is validating. sleeping for 5 seconds.")
                    time.sleep(5)
            if process_shutdown_event.is_set():
                break
            if status != "succeeded":
                logger.exception(
                    "Critical Error in daily_migrate_process\nAPI validating status is "
                    + status
                )
                subject = (
                    "daily_migrate_process Critical Error : API validating status is "
                    + status
                )
                details = (
                    "Critical Error in daily_migrate_process:\nAPI validating status is "
                    + status
                    + " Migration of tables not achieved. Cleanup of old tables not achieved. "
                    + "API integrity needs checked. If this continues, may have filesize issues."
                )
                url = bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": bus_project_key}
                try:
                    api_manager.post_error(url, headers, subject, details, logger)
                except Exception as e:
                    logger.exception("High Error, unable to mail error.\n" + repr(e))
                continue

        except Exception as e:
            logger.exception("High Error in daily_migrate_process()\n" + repr(e))
            subject = "daily_migrate_process High Error :" + repr(e)
            details = (
                "High Error in daily_migrate_process:\n"
                + repr(e)
                + "\n"
                + "Migration of tables not achieved. Cleanup of old tables not achieved. "
                + "If this continues, may have filesize issues."
            )
            url = bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": bus_project_key}
            try:
                api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            continue

        # After migration has finished, delete old tables
        logger.info("deleting old basic tables")

        url = bus_project_url + "/basic/delete_old"
        headers = {"x-api-key": bus_project_key}
        if process_shutdown_event.is_set():
            break
        try:
            _r, _attempts = api_manager.delete_api(url, headers, logger)
        except Exception as e:
            logger.exception(
                "High Error in deletion phase of daily_migrate_process:\n" + repr(e)
            )
            subject = "daily_migrate_process High Error in deletion phase :" + repr(e)
            details = (
                "High Error in daily_migrate_process in deletion phase :\n"
                + repr(e)
                + "\n"
                + "Migration of tables not achieved. Cleanup of old tables not achieved. "
                + "If this continues, may have filesize issues."
            )
            url = bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": bus_project_key}
            try:
                api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e:
                logger.exception("High Error, unable to mail error.\n" + repr(e))
            continue

        # wait until deleting has finished
        try:
            status = "deleting"
            while status == "deleting":
                if process_shutdown_event.is_set():
                    break
                logger.info("Checking if API is deleting")
                status = api.check_deleting(bus_project_url, bus_project_key, logger)
                if process_shutdown_event.is_set():
                    break
                if status == "deleting":
                    logger.info("API is deleting. sleeping for 5 seconds.")
                    time.sleep(5)
            if process_shutdown_event.is_set():
                break
            if status != "succeeded":
                logger.exception(
                    "Critical Error in daily_migrate_process\nAPI deleting status is "
                    + status
                )
                subject = (
                    "daily_migrate_process Critical Error : API deleting status is "
                    + status
                )
                details = (
                    "Critical Error in daily_migrate_process:\nAPI deleting status is "
                    + status
                    + "Cleanup of old tables not achieved. "
                    + "API integrity needs checked. If this continues, may have filesize issues."
                )
                url = bus_project_url + "/mail/send_error_email"
                headers = {"x-api-key": bus_project_key}
                try:
                    api_manager.post_error(url, headers, subject, details, logger)
                except Exception as e:
                    logger.exception("High Error, unable to mail error.\n" + repr(e))
                continue

        except Exception as e:
            logger.exception(
                "High Error in deleting phase of daily_migrate_process()\n" + repr(e)
            )
            subject = "daily_migrate_process High Error in deleting phase:" + repr(e)
            details = (
                "High Error in daily_migrate_process in deleting phase:\n"
                + repr(e)
                + "\n"
                + "Cleanup of old tables not achieved. "
                + "If this continues, may have filesize issues."
            )
            url = bus_project_url + "/mail/send_error_email"
            headers = {"x-api-key": bus_project_key}
            try:
                api_manager.post_error(url, headers, subject, details, logger)
            except Exception as e2:
                logger.exception("High Error, unable to mail error.\n" + repr(e2))
            continue

        logger.info("API finished deleting")

        logger.info("daily_migrate sequence complete")
    logger.info("Process shutdown recieved, terminating")
