export const sampleData = {
  jobs: [
    {
      id: 101,
      title: "Atlanta Fiber Backbone Expansion",
      market: "Atlanta, GA",
      requestedBy: "Network PMO",
      jobType: "Fiber build",
      priority: "High",
      intakeStatus: "Review",
      scheduledStartAt: "2026-05-03T14:00:00",
      assignedTo: "Summit Civil Group",
      fieldStatus: "Assigned",
      completion: 58,
      budget: 8.4,
      issue: "Permitting hold is delaying bore path start for phase 2.",
      qualityScore: 91,
      durationVariance: 18
    },
    {
      id: 102,
      title: "Dallas Small Cell Retrofit",
      market: "Dallas, TX",
      requestedBy: "Carrier Delivery",
      jobType: "Small cell",
      priority: "Medium",
      intakeStatus: "Approved",
      scheduledStartAt: "2026-05-03T09:00:00",
      assignedTo: "Axis Wireless Build",
      fieldStatus: "In Progress",
      completion: 72,
      budget: 5.1,
      issue: "Materials and city inspections are aligned.",
      qualityScore: 95,
      durationVariance: -9
    },
    {
      id: 103,
      title: "Miami Power Upgrade Program",
      market: "Miami, FL",
      requestedBy: "Regional Ops",
      jobType: "Power upgrade",
      priority: "High",
      intakeStatus: "Submitted",
      scheduledStartAt: "2026-05-03T07:30:00",
      assignedTo: "",
      fieldStatus: "Assigned",
      completion: 43,
      budget: 11.3,
      issue: "Subcontractor staffing dipped below target this week.",
      qualityScore: 84,
      durationVariance: 27
    },
    {
      id: 104,
      title: "Phoenix Tower Maintenance Wave",
      market: "Phoenix, AZ",
      requestedBy: "Tower Ops",
      jobType: "Tower maintenance",
      priority: "Low",
      intakeStatus: "Approved",
      scheduledStartAt: "2026-05-04T12:00:00",
      assignedTo: "Desert Peak Services",
      fieldStatus: "Completed",
      completion: 100,
      budget: 3.2,
      issue: "Daily completion above forecast.",
      qualityScore: 97,
      durationVariance: -14
    },
    {
      id: 105,
      title: "Charlotte Transport Upgrade",
      market: "Charlotte, NC",
      requestedBy: "Transport PMO",
      jobType: "Transport",
      priority: "Medium",
      intakeStatus: "Submitted",
      scheduledStartAt: "2026-05-04T08:00:00",
      assignedTo: "",
      fieldStatus: "Assigned",
      completion: 0,
      budget: 4.8,
      issue: "Needs resource confirmation before acceptance.",
      qualityScore: 88,
      durationVariance: 0
    }
  ],
  crews: [
    { name: "MasTec East Fiber Crew", type: "Internal team", available: 5, assigned: 4, utilization: 80, note: "Can absorb one overnight start." },
    { name: "Summit Civil Group", type: "Contractor", available: 3, assigned: 3, utilization: 100, note: "Atlanta crew fully loaded." },
    { name: "Axis Wireless Build", type: "Contractor", available: 4, assigned: 3, utilization: 75, note: "Dallas capacity healthy." },
    { name: "Desert Peak Services", type: "Contractor", available: 2, assigned: 1, utilization: 50, note: "Phoenix backup available." }
  ],
  kpis: {
    teams: [
      { name: "MasTec East Fiber Crew", jobsPerWeek: 14, avgCompletionHours: 9.3, onTimeStartRate: 94, reworkRate: 5, sampleSize: 31 },
      { name: "Regional Power Team", jobsPerWeek: 9, avgCompletionHours: 15.6, onTimeStartRate: 82, reworkRate: 9, sampleSize: 18 }
    ],
    contractors: [
      { name: "Summit Civil Group", jobsPerWeek: 12, avgCompletionHours: 13.8, onTimeStartRate: 79, reworkRate: 8, sampleSize: 25 },
      { name: "Axis Wireless Build", jobsPerWeek: 15, avgCompletionHours: 8.7, onTimeStartRate: 96, reworkRate: 4, sampleSize: 29 },
      { name: "Desert Peak Services", jobsPerWeek: 7, avgCompletionHours: 10.1, onTimeStartRate: 92, reworkRate: 3, sampleSize: 14 }
    ]
  }
};
