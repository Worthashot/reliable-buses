"""
Created on Sun Jun  7 14:59:00 2026

@author: Cameron
"""

from .managers.api_manager import APIManager


def check_deleting(bus_project_url, bus_project_key, logger):
    api_manager = APIManager()
    url = bus_project_url + "/taskstatus/get_status"
    headers = {"x-api-key": bus_project_key,
               "Content-Type": "text/plain"}
    data = "deleting"
    wait_times = [2 ** (i + 1) for i in range(9)]
    r, _attempts = api_manager.post_api(
        url, headers, logger, max_tries=9, wait_times=wait_times, data=data
    )
    return r.text
