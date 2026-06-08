"""
Created on Sun Jun  7 14:19:33 2026

@author: Cameron
"""


class LoggerWriter:
    """Writes each line to the logger at the given level."""

    def __init__(self, logger, level):
        self.logger = logger
        self.level = level
        self.buffer = ""

    def write(self, message):
        if message.strip():  # ignore empty lines
            self.logger.log(self.level, message.rstrip())

    def flush(self):
        pass
