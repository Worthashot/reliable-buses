"""
Created on Sun Jun  7 14:15:51 2026

@author: Cameron
"""

import threading


class UpdateSaveCoordinator:
    def __init__(self):
        self._lock = threading.Lock()
        self._cond = threading.Condition(self._lock)
        self._active_updates = 0
        self._saving = False

    def begin_update(self):
        """Call before modifying the shared state (multiple threads allowed)."""
        with self._lock:
            while self._saving:
                self._cond.wait()
            self._active_updates += 1

    def end_update(self):
        """Call after modifying the shared state."""
        with self._lock:
            self._active_updates -= 1
            if self._active_updates == 0:
                self._cond.notify_all()  # wake up any waiting saves

    def begin_save(self):
        """Call before saving the state (only one thread at a time)."""
        with self._lock:
            while self._saving or self._active_updates > 0:
                self._cond.wait()
            self._saving = True

    def end_save(self):
        """Call after saving the state."""
        with self._lock:
            self._saving = False
            self._cond.notify_all()  # wake up waiting updates & saves
