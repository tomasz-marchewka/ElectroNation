// City demand truth per docs/05 §3–§4: two consumer segments (households,
// firms) with their own hourly profiles and unit energies, a monthly seasonal
// multiplier and a temperature "V" modifier. Truth stays hourly; a turn sees
// its 3-hour block average (01 §2.2).

import {
  DEMAND_PROFILES,
  DEMAND_SEASONAL,
  DEMAND_WEATHER,
  UNIT_ENERGY_KWH,
} from "./config";
import { quantize01 } from "./quantize";

export type DayType = "working" | "free";

/** 05 §4.3: demand multiplier from air temperature (heating/cooling "V"). */
export function weatherDemandMultiplier(tempC: number): number {
  const heating =
    DEMAND_WEATHER.heatingPerC *
    Math.max(0, DEMAND_WEATHER.heatingThresholdC - tempC);
  const cooling =
    DEMAND_WEATHER.coolingPerC *
    Math.max(0, tempC - DEMAND_WEATHER.coolingThresholdC);
  return Math.min(DEMAND_WEATHER.cap, 1 + heating + cooling);
}

/**
 * 05 §4.1: true hourly demand of a city [MW], before quantization.
 * Unit energies are in kWh/day, so ×count/24 gives kW and /1000 gives MW.
 */
export function cityDemandMwAtHour(
  households: number,
  firms: number,
  dayType: DayType,
  hour: number,
  month: number,
  tempC: number,
): number {
  const householdKw =
    (households * UNIT_ENERGY_KWH.household[dayType]) / 24 *
    (DEMAND_PROFILES.household[dayType][hour] ?? 0);
  const firmKw =
    (firms * UNIT_ENERGY_KWH.firm[dayType]) / 24 *
    (DEMAND_PROFILES.firm[dayType][hour] ?? 0);
  const seasonal = DEMAND_SEASONAL[month] ?? 1;
  return ((householdKw + firmKw) / 1000) * seasonal * weatherDemandMultiplier(tempC);
}

/** 24 quantized hourly demand values for one city and one day. */
export function cityDemandDayMw(
  households: number,
  firms: number,
  dayType: DayType,
  month: number,
  tempC: number[],
): number[] {
  const result: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    result.push(
      quantize01(
        cityDemandMwAtHour(households, firms, dayType, hour, month, tempC[hour] ?? 15),
      ),
    );
  }
  return result;
}
