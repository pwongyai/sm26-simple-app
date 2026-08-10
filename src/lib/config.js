// Real AgroAPI identity for this test — one farmer org, one contractor org,
// and the specific cropzones the farmer owns within their organization.
// Swap-out point once this needs to support more than one farmer/contractor.

export const FARMER_ORG = {
  id: "c58112b7-4409-413f-913a-10d364139a14",
  name: "Ruang Kaeo Rice Community",
};

export const CONTRACTOR_ORG = {
  id: "486e1a5e-ddc5-4541-a09f-fcdf77f94350",
  name: "กินรี",
};

// The farmer's cropzones (each treated as one "field" in this app's UI).
export const FARMER_CROPZONE_IDS = [
  "f941d966-9459-4307-ac67-2562ffdae35f",
  "434df574-9ce8-435c-ac65-5f248590247d",
  "31a771e8-7e92-4c2d-ae7b-a737d64115e5",
];
