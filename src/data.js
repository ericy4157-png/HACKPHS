import { airports } from "./referenceData.js";
import { generateNetwork } from "./networkGenerator.js";

// Airport positions and runway lengths come from the OurAirports reference snapshot when
// it is present, with built-in values as the fallback (see src/referenceData.js).
export { airports };

// Simplified operational polygons for demonstration only. Production use requires
// validated, time-bounded NOTAM/AIP and sovereign airspace data.
export const restrictedZones = [
  { id: "UA-CONFLICT", name: "Ukraine conflict airspace", reason: "Active conflict / FIR restriction", severity: "prohibited", polygon: [[44, 22], [53, 22], [53, 41], [44, 41]] },
  { id: "RU-RESTRICTED", name: "Russian overflight restriction", reason: "Operator policy / sanctions", severity: "prohibited", polygon: [[41, 27], [78, 27], [78, 190], [41, 190]] },
  { id: "GAZA-CONFLICT", name: "Gaza conflict airspace", reason: "Active conflict", severity: "prohibited", polygon: [[30.9, 34.1], [31.8, 34.1], [31.8, 35.0], [30.9, 35.0]] },
  { id: "TIBET-HIGH-TERRAIN", name: "Tibetan Plateau high terrain", reason: "High terrain / limited diversion options", severity: "avoid", polygon: [[27, 78], [37, 78], [37, 104], [27, 104]] }
];

// The multi-day network: one continuous rotation per tail, with fuel, maintenance, crew duty and
// passenger itineraries (see docs/network-model.md). Generated once at load from a fixed seed.
const network = generateNetwork({ airports });

export const flights = network.flights;
export const fleet = network.fleet;
export const rotations = network.rotations;
export const passengerGroups = network.passengerGroups;
export const crewAssignments = network.crewAssignments;
