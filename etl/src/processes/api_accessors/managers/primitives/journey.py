"""
Created on Sun Oct 26 19:10:32 2025

@author: Cameron
"""


# This is responsible for storing the listof ordered stops each service should pass on its journey.
# This has the function of giving all stops a bus may have passed since last it was checked
class Journey:
    def __init__(self, name, stop_list, direction, date_added):
        self.date_added = date_added
        self.name = name
        self.direction = direction
        self.list_of_stops = stop_list

    def get_route_section_name(self):
        return self.name.split(":")[1]

    def get_destination(self):
        names = self.name.split(":")[1]
        return names.split(" - ")[1].strip()

    def get_origin(self):
        names = self.name.split(":")[1]
        return names.split(" - ")[0].strip()

    def get_service(self):
        return self.name.split(":")[0]

    def get_arivals(self, old_stop, new_stop):
        if old_stop == 0:
            return (False, [])
        if old_stop not in self.list_of_stops:
            return (False, [])
        start_index = self.list_of_stops.index(old_stop)
        if new_stop not in self.list_of_stops:
            return (False, [])
        end_index = self.list_of_stops.index(new_stop)
        return (True, self.list_of_stops[start_index + 1 : end_index + 1])
