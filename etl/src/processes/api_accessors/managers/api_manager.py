"""
Created on Thu Jun  4 14:54:44 2026

@author: Cameron
"""

import copy
import socket
import time

import requests
from requests import Response
from requests.exceptions import ConnectionError, HTTPError, Timeout
from urllib3.exceptions import NewConnectionError


class APIManager:
    def __init__(self):
        self._FAILED_RESPONSE = requests.Response()
        self._FAILED_RESPONSE.status_code = 0
        self._FAILED_RESPONSE._content = b""
        self._FAILED_RESPONSE.reason = "Request failed (simulated)"
        self.non_recoverable_errnos = {
            101,  # Network unreachable
            113,  # Host unreachable
            None,  # Will check message strings
        }


    def send_error_message(self, base_url, key, subject, details, logger):
        url = base_url + "/mail/send_error_email"
        headers = {"x-api-key": key}
        try:
            self.post_error(url, headers, subject, details, logger)
        except Exception as e:
            logger.exception("High Error, unable to mail error.\n" + repr(e))

    def post_error(
        self,
        url,
        headers,
        subject,
        details,
        logger,
        max_tries=1,
        timeout_times=(5, 10),
        wait_times=None,
    ) -> tuple[Response, int]:
        if wait_times is None:
            wait_times = [2]
        data = {"subject": subject, "content": details}
        r = copy.copy(self._FAILED_RESPONSE)
        for attempts in range(max_tries):
            try:
                r = requests.post(
                    url, headers=headers, data=data, timeout=timeout_times
                )
                r.raise_for_status()
                return r, attempts
            except HTTPError as e:
                status_code = e.response.status_code if e.response else None
                if status_code and 400 <= status_code < 500:
                    if status_code in (408, 429):
                        logger.warning(f"HTTP {status_code} on {url}, will retry")
                        if attempts == max_tries:
                            logger.error(f"Max tries reached for {url}: {e}")
                            raise
                        logger.info(
                            f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                        )
                        time.sleep(wait_times[attempts])
                        continue
                    logger.error(
                        f"Non-retryable HTTP error {status_code} on {url}: {e}"
                    )
                    raise
                if status_code and 500 <= status_code < 600:
                    logger.warning(f"HTTP {status_code} on {url}, will retry")
                    if attempts == max_tries:
                        logger.error(f"Max retries reached for {url}: {e}")
                        raise
                    logger.info(
                        f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                    )
                    time.sleep(wait_times[attempts])
                    continue
                logger.error(f"Unexpected HTTPError: {e}")
                raise

            except ConnectionError as e:
                errno = None
                if hasattr(e, "args") and len(e.args) > 0:
                    # Try to extract errno from nested exceptions
                    if isinstance(e.args[0], socket.error):
                        errno = e.args[0].errno
                    elif (
                        isinstance(e.args[0], NewConnectionError)
                        and hasattr(e.args[0], "args")
                        and len(e.args[0].args) > 0
                        and isinstance(e.args[0].args[0], socket.error)
                    ):
                        errno = e.args[0].args[0].errno

                error_str = str(e).lower()
                if (
                    errno in (101, 113)
                    or "network is unreachable" in error_str
                    or "host unreachable" in error_str
                    or "dns" in error_str
                    or "name or service not known" in error_str
                ):
                    logger.error(
                        f"Non-recoverable network error (errno {errno}) on {url}: {e}"
                    )
                    raise

                logger.warning(f"Recoverable connection error on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Timeout as e:
                logger.warning(f"Timeout on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Exception as e:
                logger.error(f"Unexpected exception on {url}: {e}")
                raise

        raise RuntimeError(
            f"Failed to complete request to {url} after {max_tries} tries"
        )

    def post_api(
        self,
        url,
        headers,
        logger,
        data=None,
        max_tries=1,
        timeout_times=(5, 10),
        wait_times=None,
    ) -> tuple[Response, int]:
        if data is None:
            data = []
        if wait_times is None:
            wait_times = [2]
        r = copy.copy(self._FAILED_RESPONSE)
        for attempts in range(max_tries):
            try:
                r = requests.post(
                    url, headers=headers, data=data, timeout=timeout_times
                )
                r.raise_for_status()
                return r, attempts
            except HTTPError as e:
                status_code = e.response.status_code if e.response else None
                if status_code and 400 <= status_code < 500:
                    if status_code in (408, 429):
                        logger.warning(f"HTTP {status_code} on {url}, will retry")
                        if attempts == max_tries:
                            logger.error(f"Max tries reached for {url}: {e}")
                            raise
                        logger.info(
                            f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                        )
                        time.sleep(wait_times[attempts])
                        continue
                    logger.error(
                        f"Non-retryable HTTP error {status_code} on {url}: {e}"
                    )
                    raise
                if status_code and 500 <= status_code < 600:
                    logger.warning(f"HTTP {status_code} on {url}, will retry")
                    if attempts == max_tries:
                        logger.error(f"Max retries reached for {url}: {e}")
                        raise
                    logger.info(
                        f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                    )
                    time.sleep(wait_times[attempts])
                    continue
                logger.error(f"Unexpected HTTPError: {e}")
                raise

            except ConnectionError as e:
                errno = None
                if hasattr(e, "args") and len(e.args) > 0:
                    # Try to extract errno from nested exceptions
                    if isinstance(e.args[0], socket.error):
                        errno = e.args[0].errno
                    elif (
                        isinstance(e.args[0], NewConnectionError)
                        and hasattr(e.args[0], "args")
                        and len(e.args[0].args) > 0
                        and isinstance(e.args[0].args[0], socket.error)
                    ):
                        errno = e.args[0].args[0].errno

                error_str = str(e).lower()
                if (
                    errno in (101, 113)
                    or "network is unreachable" in error_str
                    or "host unreachable" in error_str
                    or "dns" in error_str
                    or "name or service not known" in error_str
                ):
                    logger.error(
                        f"Non-recoverable network error (errno {errno}) on {url}: {e}"
                    )
                    raise

                logger.warning(f"Recoverable connection error on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Timeout as e:
                logger.warning(f"Timeout on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Exception as e:
                logger.error(f"Unexpected exception on {url}: {e}")
                raise

        raise RuntimeError(
            f"Failed to complete request to {url} after {max_tries} tries"
        )

    def get_api(
        self,
        url,
        headers,
        logger,
        max_tries=3,
        timeout_times=(5, 10),
        wait_times=None,
    ) -> tuple[Response, int]:
        if wait_times is None:
            wait_times = [2, 4, 8]
        r = copy.copy(self._FAILED_RESPONSE)
        for attempts in range(max_tries):
            try:
                r = requests.get(url, headers=headers, timeout=timeout_times)
                r.raise_for_status()
                return r, attempts
            except HTTPError as e:
                status_code = e.response.status_code if e.response else None
                if status_code and 400 <= status_code < 500:
                    if status_code in (408, 429):
                        logger.warning(f"HTTP {status_code} on {url}, will retry")
                        if attempts == max_tries:
                            logger.error(f"Max tries reached for {url}: {e}")
                            raise
                        logger.info(
                            f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                        )
                        time.sleep(wait_times[attempts])
                        continue
                    logger.error(
                        f"Non-retryable HTTP error {status_code} on {url}: {e}"
                    )
                    raise
                if status_code and 500 <= status_code < 600:
                    logger.warning(f"HTTP {status_code} on {url}, will retry")
                    if attempts == max_tries:
                        logger.error(f"Max retries reached for {url}: {e}")
                        raise
                    logger.info(
                        f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                    )
                    time.sleep(wait_times[attempts])
                    continue
                logger.error(f"Unexpected HTTPError: {e}")
                raise

            except ConnectionError as e:
                errno = None
                if hasattr(e, "args") and len(e.args) > 0:
                    # Try to extract errno from nested exceptions
                    if isinstance(e.args[0], socket.error):
                        errno = e.args[0].errno
                    elif (
                        isinstance(e.args[0], NewConnectionError)
                        and hasattr(e.args[0], "args")
                        and len(e.args[0].args) > 0
                        and isinstance(e.args[0].args[0], socket.error)
                    ):
                        errno = e.args[0].args[0].errno

                error_str = str(e).lower()
                if (
                    errno in (101, 113)
                    or "network is unreachable" in error_str
                    or "host unreachable" in error_str
                    or "dns" in error_str
                    or "name or service not known" in error_str
                ):
                    logger.error(
                        f"Non-recoverable network error (errno {errno}) on {url}: {e}"
                    )
                    raise

                logger.warning(f"Recoverable connection error on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Timeout as e:
                logger.warning(f"Timeout on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Exception as e:
                logger.error(f"Unexpected exception on {url}: {e}")
                raise

        raise RuntimeError(
            f"Failed to complete request to {url} after {max_tries} tries"
        )

    def delete_api(
        self,
        url,
        headers,
        logger,
        data=None,
        max_tries=3,
        timeout_times=(5, 10),
        wait_times=None,
    ) -> tuple[Response, int]:
        if wait_times is None:
            wait_times = [2, 4, 8]

        if data is None:
            data = []
        r = copy.copy(self._FAILED_RESPONSE)
        for attempts in range(max_tries):
            try:
                r = requests.delete(
                    url, headers=headers, data=data, timeout=timeout_times
                )
                r.raise_for_status()
                return r, attempts
            except HTTPError as e:
                status_code = e.response.status_code if e.response else None
                if status_code and 400 <= status_code < 500:
                    if status_code in (408, 429):
                        logger.warning(f"HTTP {status_code} on {url}, will retry")
                        if attempts == max_tries:
                            logger.error(f"Max tries reached for {url}: {e}")
                            raise
                        logger.info(
                            f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                        )
                        time.sleep(wait_times[attempts])
                        continue
                    logger.error(
                        f"Non-retryable HTTP error {status_code} on {url}: {e}"
                    )
                    raise
                if status_code and 500 <= status_code < 600:
                    logger.warning(f"HTTP {status_code} on {url}, will retry")
                    if attempts == max_tries:
                        logger.error(f"Max retries reached for {url}: {e}")
                        raise
                    logger.info(
                        f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                    )
                    time.sleep(wait_times[attempts])
                    continue
                logger.error(f"Unexpected HTTPError: {e}")
                raise

            except ConnectionError as e:
                errno = None
                if hasattr(e, "args") and len(e.args) > 0:
                    # Try to extract errno from nested exceptions
                    if isinstance(e.args[0], socket.error):
                        errno = e.args[0].errno
                    elif (
                        isinstance(e.args[0], NewConnectionError)
                        and hasattr(e.args[0], "args")
                        and len(e.args[0].args) > 0
                        and isinstance(e.args[0].args[0], socket.error)
                    ):
                        errno = e.args[0].args[0].errno

                error_str = str(e).lower()
                if (
                    errno in (101, 113)
                    or "network is unreachable" in error_str
                    or "host unreachable" in error_str
                    or "dns" in error_str
                    or "name or service not known" in error_str
                ):
                    logger.error(
                        f"Non-recoverable network error (errno {errno}) on {url}: {e}"
                    )
                    raise

                logger.warning(f"Recoverable connection error on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Timeout as e:
                logger.warning(f"Timeout on {url}: {e}")
                if attempts == max_tries:
                    logger.error(f"Max tries reached for {url}: {e}")
                    raise
                logger.info(
                    f"Retry {attempts + 1}/{max_tries} after {wait_times[attempts]}s"
                )
                time.sleep(wait_times[attempts])
                continue

            except Exception as e:
                logger.error(f"Unexpected exception on {url}: {e}")
                raise

        raise RuntimeError(
            f"Failed to complete request to {url} after {max_tries} tries"
        )
