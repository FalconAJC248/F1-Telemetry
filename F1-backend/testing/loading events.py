import fastf1
import fastf1.plotting
import matplotlib.pyplot as plt
session = fastf1.get_session(2025, 7, 'Q')
session.load(telemetry=True)
car81_data = session.car_data['81']

plt.plot(car81_data['Speed'], car81_data['Time'], label='Speed (km/h)')
plt.savefig('/home/ajchi/F1-backend/plot_imgs/telemetry.png')
print("Saved to telemetry.png")

event = fastf1.get_event(2021, 'brazil')

schedule = fastf1.get_event_schedule(2025)




