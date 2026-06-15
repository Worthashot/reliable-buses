"""
Created on Sun Jun  7 14:51:01 2026

@author: Cameron
"""

from .managers.api_manager import APIManager


def check_migrating(bus_project_url, bus_project_key, logger):
    api_manager = APIManager()
    url = bus_project_url + "/taskstatus/get_status"
    headers = {"x-api-key": bus_project_key,
               "Content-Type": "text/plain"}
    data = "migrating"
    wait_times = [2 ** (i + 1) for i in range(9)]
    r, _attempts = api_manager.post_api(
        url, headers, logger, max_tries=9, wait_times=wait_times, data=data
    )
    return r.text
