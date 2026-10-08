# FlightAware Terminal Lookup

The booking form can look up a flight by flight number and ride date. For an airport pickup it uses the flight's arrival airport and terminal; for an airport destination it uses the departure airport and terminal. The rider must confirm the returned airport matches the selected trip stop.

## Configure

1. Enable FlightAware AeroAPI access for the account and plan.
2. Add `FLIGHTAWARE_API_KEY` as a server-side Netlify environment variable for the deploy context.
3. Deploy the Netlify function and apply database migration `082.001_airport_flight_lookup.sql`.

Keep the key out of browser code and source control. The lookup endpoint applies a limit of 10 requests per minute per client.

Terminal and gate data depends on the airline and airport and may be absent or change. The booking panel allows a terminal to be entered manually when AeroAPI does not return one. Non-production test mode returns a simulated flight response.
