"""
Created on Sun Jun  7 15:00:33 2026

@author: Cameron
"""

from .managers.api_manager import APIManager


def check_validating(bus_project_url, bus_project_key, logger):
    api_manager = APIManager()
    url = bus_project_url + "/basic/is_validating"
    headers = {"x-api-key": bus_project_key}
    wait_times = [2 ** (i + 1) for i in range(9)]
    r, _attempts = api_manager.get_api(
        url, headers, logger, max_tries=9, wait_times=wait_times
    )
    if r.json()[0] == "0":
        return "succeeded"
    if r.json()[0] == "1":
        return "validating"
    if r.json()[0] == "2":
        return "failed"
    return "unexplained"
