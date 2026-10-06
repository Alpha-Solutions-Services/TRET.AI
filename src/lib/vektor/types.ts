export type AppointmentType =
  | "APPOINTMENT_TYPE_FIXED"
  | "APPOINTMENT_TYPE_RANGE"
  | "APPOINTMENT_TYPE_NEED_TO_SET"
  | string;

export type VektorStop = {
  kind?: string;
  orderFriendlyId?: string;
  orderId?: string;
  sequence?: string;
  orderStopType?: string;
  orderStopStatus?: string;
  arrivedAt?: string | null;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  appointmentStartAtLocal?: string | null;
  appointmentEndAtLocal?: string | null;
  appointmentType?: AppointmentType | null;
  orderReferenceId?: string | null;
  orderBrokerId?: string | null;
  location?: { city?: string | null; state?: string | null } | null;
};

export type VektorLineage = {
  rootManifestId?: string | null;
  parentManifestId?: string | null;
  relatedManifestId?: string | null;
  relation?: string | null;
};

export type VektorOrder = {
  orderId?: string;
  friendlyId?: string;
  grossAmount?: string;
  brokerId?: string | null;
  customerId?: string | null;
};

export type VektorManifest = {
  manifestId: string;
  friendlyId?: string;
  status: string;
  customStatusId?: string | null;
  loadedDistance?: string | null;
  emptyDistance?: string | null;
  totalDistance?: string | null;
  autoLoadedDistance?: string | null;
  autoEmptyDistance?: string | null;
  grossAmount?: string | null;
  grossType?: string | null;
  ratePerDistance?: string | null;
  primaryDriverId?: string | null;
  truck?: { unitNumber?: string | null; truckId?: string | null } | null;
  tour?: Record<string, unknown> | null;
  lineage?: VektorLineage | null;
  stops?: VektorStop[];
  orders?: VektorOrder[];
};

export type IssueDraft = {
  severity: "Block" | "Warn" | "Info";
  rule: string;
  message: string;
  ref?: string;
  manifestId?: string;
};

export type MappedLoad = {
  manifestId: string;
  orderIds: string[];
  loadId: string | null;
  manifestFriendlyId: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  monthKey: string | null;
  driverId: string | null;
  driverName: string | null;
  brokerId: string | null;
  brokerName: string | null;
  customerId: string | null;
  customerName: string | null;
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  loadedDistanceMi: number | null;
  emptyDistanceMi: number | null;
  autoLoadedDistanceMi: number | null;
  autoEmptyDistanceMi: number | null;
  deadheadMiles: number | null;
  rateCents: number;
  truckUnitNumber: string | null;
  vektorStatus: string;
  lineageRootManifestId: string | null;
  lineageParentManifestId: string | null;
  lineageRelatedManifestId: string | null;
  lineageRelation: string | null;
  tripGroupId: null;
  primaryLoad: null;
  issues: IssueDraft[];
  eligible: boolean;
  skipReason: string | null;
};
