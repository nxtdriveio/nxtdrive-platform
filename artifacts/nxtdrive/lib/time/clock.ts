import {
  DEFAULT_TENANT_TIME_ZONE,
  normalizeTimeZone,
  zonedYmd,
} from "@/lib/datetime";

/**
 * Source of the current instant. Domain code receives a Clock so tests and
 * release checks never depend on the wall clock of the machine running them.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  readonly #instant: Date;

  constructor(instant: Date | string) {
    const parsed = instant instanceof Date ? instant : new Date(instant);
    if (Number.isNaN(parsed.getTime())) {
      throw new TypeError("FixedClock requires a valid instant");
    }
    this.#instant = new Date(parsed.getTime());
  }

  now(): Date {
    return new Date(this.#instant.getTime());
  }
}

export const systemClock: Clock = new SystemClock();

export function todayInTimeZone(
  clock: Clock = systemClock,
  timeZone: string = DEFAULT_TENANT_TIME_ZONE,
): string {
  return zonedYmd(clock.now(), normalizeTimeZone(timeZone));
}
