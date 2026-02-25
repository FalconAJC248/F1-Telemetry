from matplotlib import pyplot as plt

import fastf1
from fastf1 import plotting


# Enable Matplotlib patches for plotting timedelta values and load
# FastF1's dark color scheme
fastf1.plotting.setup_mpl(mpl_timedelta_support=True, color_scheme='fastf1')


race = fastf1.get_session(2025, "Bahrain", 'R')
race.load()

fig, ax = plt.subplots(figsize=(8, 5))

for driver in ('HAM', 'PIA', 'VER', 'NOR'):
    laps = race.laps.pick_drivers(driver).pick_quicklaps().reset_index()
    style = plotting.get_driver_style(identifier=driver,
                                      style=['color', 'linestyle'],
                                      session=race)
    ax.plot(laps['LapTime'], **style, label=driver)

# add axis labels and a legend
ax.set_xlabel("Lap Number")
ax.set_ylabel("Lap Time")
ax.legend()
plt.savefig('/home/ajchi/F1-project/F1-backend/plot_imgs/plot.png')
print("Saved to plot.png")