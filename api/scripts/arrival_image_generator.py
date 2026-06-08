#!/home/ubuntu/prod/bin/python

import sys
import json
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np
#params list of [x,y] pairs
def generate_image(arrivals, timetables):
    points = np.array(arrivals)
    xs = points[:,1]
    ys = points[:,0]

    start_day = 20260515

    
    
    x_dim = 10000
    y_dim = 400
    dpi = 100
    
    fig, ax = plt.subplots(figsize=(x_dim / dpi, y_dim / dpi), dpi=dpi)

    
    ys = (ys - start_day)/50 + 0.25
    
    ax.scatter(xs, ys, label='Arrival Data', color='red')
    ax.set_xlim(0, 60*60*24)
    ax.set_ylim(0, 1)
    
    ax.xaxis.set_major_locator(ticker.MultipleLocator(3600))
    ax.xaxis.set_minor_locator(ticker.AutoMinorLocator(12))

    ax.xaxis.set_major_formatter(ticker.FuncFormatter(seconds_to_hours))
    
    ax.vlines(timetables, ymin=0, ymax=1, transform=ax.get_xaxis_transform(),
          colors='blue', linestyles='dashed', linewidth=1.5, label='Events')
    plt.tight_layout(pad=0)
    ax.yaxis.set_visible(False)
    plt.savefig(sys.stdout.buffer, format='png')

def seconds_to_hours(x, pos):
    hours = int(x// 3600)
    minutes = "00"
    return f'{hours}:{minutes}'

def main():
    # Read all of stdin and parse as JSON
    input_data = sys.stdin.read()
    params = json.loads(input_data)
    arrivals = params["arrivals"]
    timetables = params["timetables"]
    generate_image(arrivals, timetables)


if __name__ == '__main__':
    main()