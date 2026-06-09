"""
Created on Sun Jun  7 14:17:54 2026

@author: Cameron
"""

from pathlib import Path

import dill  # type: ignore

from .processes.api_accessors.managers.london_arrival_manager import (
    LondonArrivalManager,
)
from .processes.api_accessors.managers.london_journey_manager import (
    LondonJourneyManager,
)
from .processes.api_accessors.managers.london_stop_manager import LondonStopManager
from .processes.api_accessors.managers.london_timetable_manager import (
    LondonTimetableManager,
)


class AppState:
    def __init__(self):
        self.journey_manager: LondonJourneyManager
        self.stop_manager: LondonStopManager
        self.arrival_manager: LondonArrivalManager
        self.timetable_manager: LondonTimetableManager
        self.version = "1.0"
        self.must_restart = False

    def save(self, filepath="app_state.pkl"):
        with Path(filepath).open("wb") as f:
            dill.dump(self, f)

    @staticmethod
    def load(filepath="app_state.pkl"):
        with Path(filepath).open("rb") as f:
            return dill.load(f)

    @staticmethod
    def delete(filepath="app_state.pkl"):
        if Path(filepath).exists():
            Path(filepath).unlink()
