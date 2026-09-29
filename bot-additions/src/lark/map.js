import { getTenantAccessToken } from './auth.js';

const BASE_APP_TOKEN = process.env.MAP_BASE_APP_TOKEN;
const GROUPS_TABLE_ID = process.env.MAP_GROUPS_TABLE_ID;
const PINS_TABLE_ID = process.env.MAP_PINS_TABLE_ID;

// Same field-unwrapping idea as extractFieldValue() in base.js, generalized
// for text/select/checkbox/number fields.
function text(field) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field.map((f) => (typeof f === 'string' ? f : f.text || f.value || '')).join('');
  }
  if (typeof field === 'object') return field.text || field.value || '';
  return String(field);
}

async function listAllRecords(tableId) {
  const token = await getTenantAccessToken();
  let records = [];
  let pageToken = '';

  do {
    const url = new URL(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${BASE_APP_TOKEN}/tables/${tableId}/records`
    );
    url.searchParams.set('page_size', '100');
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`Failed to fetch records from table ${tableId}: ${data.msg}`);
    }

    records = records.concat(data.data?.items || []);
    pageToken = data.data?.has_more ? data.data.page_token : '';
  } while (pageToken);

  return records;
}

export async function getMapData() {
  const [groupRecords, pinRecords] = await Promise.all([
    listAllRecords(GROUPS_TABLE_ID),
    listAllRecords(PINS_TABLE_ID),
  ]);

  // Order comes from each record's position in the table's default view —
  // i.e. whatever order the rows are in when you look at the Groups table.
  // Drag rows in Lark to reorder the map's toggle buttons; just make sure
  // that view has no active sort/filter, since either would override it.
  const groups = groupRecords
    .map((r, index) => ({
      id: text(r.fields['Group ID']),
      label: text(r.fields['Label']) || text(r.fields['Group ID']),
      color: text(r.fields['Color']) || '#3388ff',
      active: r.fields['Active By Default'] === true,
      order: index,
      popupStyle: text(r.fields['Popup Style']) || 'Label Only',
    }))
    .filter((g) => g.id);

  const pins = pinRecords
    .filter((r) => r.fields['Show On Map'] !== false) // default to shown if blank
    .map((r) => ({
      name: text(r.fields['Name']),
      lat: Number(r.fields['Latitude']),
      lng: Number(r.fields['Longitude']),
      note: text(r.fields['Note']),
      group: text(r.fields['Group']),
    }))
    .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));

  return { groups, pins };
}
