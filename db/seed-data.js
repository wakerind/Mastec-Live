export const seedUsers = [
  {
    email: "admin@fieldsight.local",
    password: "Admin123!",
    name: "FieldSight Admin",
    role: "admin"
  }
];

export const seedCrews = [
  ["MasTec East Fiber Crew", "Internal team", 9, "Fiber backbone and splice crew with overnight flexibility."],
  ["Summit Civil Group", "Contractor", 6, "Civil bore and conduit partner for metro builds."],
  ["Axis Wireless Build", "Contractor", 7, "OSP and small-cell crew with testing coverage."],
  ["Desert Peak Services", "Contractor", 3, "Maintenance crew used for closeout and overflow support."]
];

export const seedJobs = [
  [
    "Atlanta Fiber Backbone Expansion",
    "Atlanta, GA",
    "Network PMO",
    "Fiber build",
    "High",
    "Review",
    "2026-05-03T14:00:00",
    "Summit Civil Group",
    "Assigned",
    58,
    840000,
    465000,
    72,
    18,
    "Permit hold on bore path phase 2",
    "Permitting hold is delaying bore path start for phase 2.",
    91,
    18
  ],
  [
    "Dallas Small Cell Retrofit",
    "Dallas, TX",
    "Carrier Delivery",
    "Small cell",
    "Medium",
    "Assigned",
    "2026-05-03T09:00:00",
    "Axis Wireless Build",
    "In Progress",
    72,
    510000,
    296000,
    48,
    38,
    "",
    "Materials and city inspections are aligned.",
    95,
    -9
  ],
  [
    "Miami Power Upgrade Program",
    "Miami, FL",
    "Regional Ops",
    "Power upgrade",
    "High",
    "Uploaded",
    "2026-05-03T07:30:00",
    null,
    "Assigned",
    43,
    1130000,
    682000,
    96,
    0,
    "Subcontractor staffing dipped below target",
    "Subcontractor staffing dipped below target this week.",
    84,
    27
  ],
  [
    "Phoenix Tower Maintenance Wave",
    "Phoenix, AZ",
    "Tower Ops",
    "Tower maintenance",
    "Low",
    "Assigned",
    "2026-05-04T12:00:00",
    "Desert Peak Services",
    "Completed",
    100,
    320000,
    146000,
    30,
    26,
    "",
    "Daily completion above forecast.",
    97,
    -14
  ],
  [
    "Charlotte Transport Upgrade",
    "Charlotte, NC",
    "Transport PMO",
    "Transport",
    "Medium",
    "Scheduled",
    "2026-05-04T08:00:00",
    "MasTec East Fiber Crew",
    "Acknowledged",
    14,
    480000,
    218000,
    44,
    6,
    "",
    "Crew acknowledged start window and material delivery.",
    88,
    0
  ]
];
