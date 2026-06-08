"""
Created on Sun Jun  7 14:51:01 2026

@author: Cameron
"""

from .managers.api_manager import APIManager


def check_migrating(bus_project_url, bus_project_key, logger):
    api_manager = APIManager()
    url = bus_project_url + "/migration/is_migrating"
    headers = {"x-api-key": bus_project_key}
    wait_times = [2 ** (i + 1) for i in range(11)]
    r, _attempts = api_manager.get_api(
        url, headers, logger, max_tries=11, wait_times=wait_times
    )
    if r.json()[0] == "0":
        return "succeeded"
    if r.json()[0] == "1":
        return "migrating"
    if r.json()[0] == "2":
        return "failed"
    return "unexplained"
