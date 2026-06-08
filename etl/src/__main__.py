"""
Created on Sun Jun  7 15:53:51 2026

@author: Cameron
"""

from .london_server_process_manager import LondonServerProcessManager

if __name__ == "__main__":
    process_manager = LondonServerProcessManager()
    process_manager.main()
