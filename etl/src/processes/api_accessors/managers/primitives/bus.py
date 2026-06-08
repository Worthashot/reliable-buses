"""
Created on Tue Jan  6 15:32:57 2026

@author: Cameron
"""

# This has the role of storing the current location, service, and last lookup time of an active bus. Will aslo
# store relevent information to identify this bus. will be unique for each leg of a journey. Will include
# funcitonality to clear if not updated for more than and hour.
from datetime import datetime
from zoneinfo import ZoneInfo


class Bus:
    def __init__(
        self,
        trip_id,
        location_id,
        time,
        date,
        service,
        origin,
        origin_id,
        terminus,
        terminus_id,
        direction,
        journey_count,
    ):
        self.trip_id = trip_id
        self.service: str = service
        self.origin: str = origin
        self.origin_id: str = origin_id
        self.terminus: str = terminus
        self.terminus_id: str = terminus_id
        self.direction: str = direction
        self.journey_count: str = journey_count

        self.last_lookup = datetime.now(ZoneInfo("Europe/London"))
        self.first_lookup = datetime.now(ZoneInfo("Europe/London"))
        self.arrival_log = {location_id: {"time": time, "date": date}}
        self.visited_locations = {location_id}
        self.stored_locations = set()

    def update(self, location_id, arrival_time):
        if location_id in self.visited_locations:
            return

        time = (
            arrival_time.second + 60 * arrival_time.minute + 60 * 60 * arrival_time.hour
        )
        date = int(arrival_time.strftime("%Y-%m-%d").replace("-", ""))

        self.arrival_log[location_id] = {"time": time, "date": date}
        self.visited_locations.add(location_id)
        self.last_lookup = datetime.now(ZoneInfo("Europe/London"))

    def purge(self):
        two_hours_since_last_lookup = (
            abs(
                self.last_lookup.timestamp()
                - datetime.now(ZoneInfo("Europe/London")).timestamp()
            )
            > 60 * 60 * 2
        )
        ten_hours_since_creation = (
            abs(
                self.first_lookup.timestamp()
                - datetime.now(ZoneInfo("Europe/London")).timestamp()
            )
            > 60 * 60 * 10
        )
        return two_hours_since_last_lookup or ten_hours_since_creation
