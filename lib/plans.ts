import type { ClientPlan } from "./types";

export const PLANS: {
  id: ClientPlan;
  label: string;
  feePaise: number;
  limits: string;
}[] = [
  {
    id: "basic",
    label: "Basic",
    feePaise: 79_900,
    limits: "10 tables · 3 months history",
  },
  {
    id: "standard",
    label: "Standard",
    feePaise: 149_900,
    limits: "30 tables · 12 months · kitchen screen",
  },
  {
    id: "premium",
    label: "Premium",
    feePaise: 199_900,
    limits: "Unlimited tables · priority support",
  },
];

export function getPlan(id: ClientPlan) {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[1];
}

export function planFee(id: ClientPlan): number {
  return getPlan(id).feePaise;
}
