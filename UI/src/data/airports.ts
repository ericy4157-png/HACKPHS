import type { Airport } from "../types";

export const AIRPORTS: Record<string, Airport> = {
  JFK: { iata: "JFK", name: "John F. Kennedy Intl", city: "New York", lat: 40.6413, lng: -73.7781 },
  LAX: { iata: "LAX", name: "Los Angeles Intl", city: "Los Angeles", lat: 33.9416, lng: -118.4085 },
  ORD: { iata: "ORD", name: "O'Hare Intl", city: "Chicago", lat: 41.9742, lng: -87.9073 },
  ATL: { iata: "ATL", name: "Hartsfield-Jackson", city: "Atlanta", lat: 33.6407, lng: -84.4277 },
  DFW: { iata: "DFW", name: "Dallas/Fort Worth", city: "Dallas", lat: 32.8998, lng: -97.0403 },
  DEN: { iata: "DEN", name: "Denver Intl", city: "Denver", lat: 39.8561, lng: -104.6737 },
  SFO: { iata: "SFO", name: "San Francisco Intl", city: "San Francisco", lat: 37.6213, lng: -122.379 },
  SEA: { iata: "SEA", name: "Seattle-Tacoma", city: "Seattle", lat: 47.4502, lng: -122.3088 },
  MIA: { iata: "MIA", name: "Miami Intl", city: "Miami", lat: 25.7959, lng: -80.287 },
  BOS: { iata: "BOS", name: "Logan Intl", city: "Boston", lat: 42.3656, lng: -71.0096 },
  IAD: { iata: "IAD", name: "Dulles Intl", city: "Washington", lat: 38.9531, lng: -77.4565 },
  PHX: { iata: "PHX", name: "Sky Harbor", city: "Phoenix", lat: 33.4373, lng: -112.0078 },
  LAS: { iata: "LAS", name: "Harry Reid Intl", city: "Las Vegas", lat: 36.084, lng: -115.1537 },
  MSP: { iata: "MSP", name: "Minneapolis-St Paul", city: "Minneapolis", lat: 44.8848, lng: -93.2223 },
  DTW: { iata: "DTW", name: "Detroit Metro", city: "Detroit", lat: 42.2162, lng: -83.3554 },
  CLT: { iata: "CLT", name: "Charlotte Douglas", city: "Charlotte", lat: 35.214, lng: -80.9431 },
  EWR: { iata: "EWR", name: "Newark Liberty", city: "Newark", lat: 40.6895, lng: -74.1745 },
  IAH: { iata: "IAH", name: "George Bush Intercontinental", city: "Houston", lat: 29.9902, lng: -95.3368 },
  SAN: { iata: "SAN", name: "San Diego Intl", city: "San Diego", lat: 32.7338, lng: -117.1933 },
  PDX: { iata: "PDX", name: "Portland Intl", city: "Portland", lat: 45.5898, lng: -122.5951 },
  SLC: { iata: "SLC", name: "Salt Lake City Intl", city: "Salt Lake City", lat: 40.7899, lng: -111.9791 },
  AUS: { iata: "AUS", name: "Austin-Bergstrom", city: "Austin", lat: 30.1945, lng: -97.6699 },
  BNA: { iata: "BNA", name: "Nashville Intl", city: "Nashville", lat: 36.1263, lng: -86.6774 },
  RDU: { iata: "RDU", name: "Raleigh-Durham", city: "Raleigh", lat: 35.8801, lng: -78.788 },
  MCO: { iata: "MCO", name: "Orlando Intl", city: "Orlando", lat: 28.4312, lng: -81.3081 },
};

export const AIRPORT_LIST = Object.values(AIRPORTS);
