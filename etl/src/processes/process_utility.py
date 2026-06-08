"""
Created on Sun Jun  7 14:26:56 2026

@author: Cameron
"""

import logging
import multiprocessing as mp
import os
import sys
from pathlib import Path

from .logger_writer import LoggerWriter


def setup_process_logging():
    """Configure logging for the current process (unique file)."""
    original_stdout = sys.stdout

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(threadName)s - %(message)s",
        stream=original_stdout,
    )
    sys.stdout = LoggerWriter(logging.getLogger("STDOUT"), logging.INFO)
    sys.stderr = LoggerWriter(logging.getLogger("STDERR"), logging.ERROR)
    process_name = mp.current_process().name
    pid = os.getpid()
    log_filename = f"logs/{process_name}_{pid}.log"

    # Create a logger for this process
    logger = logging.getLogger(process_name)  # different logger per process
    logger.setLevel(logging.INFO)

    # Avoid adding duplicate handlers if the function is called multiple times
    if not logger.handlers:
        Path("logs").mkdir(exist_ok=True)
        fh = logging.FileHandler(log_filename)
        fh.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
        logger.addHandler(fh)

    return logger
