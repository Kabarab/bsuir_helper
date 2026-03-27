import axios from 'axios';
import { getApiBaseUrl } from './apiClient';

/**
 * Utility to fetch and parse XML from BSUIR IIS API.
 */

// --- Simple in-memory TTL cache ---
const _cache = {};
function cacheGet(key, ttlMs) {
  const e = _cache[key];
  if (e && Date.now() - e.ts < ttlMs) return e.data;
  return null;
}
function cacheSet(key, data) {
  _cache[key] = { data, ts: Date.now() };
}
const TTL_GROUPS = 5 * 60 * 1000;   // 5 min
const TTL_SPECS  = 5 * 60 * 1000;   // 5 min
const TTL_RATING = 10 * 60 * 1000;  // 10 min

async function getCachedGroups() {
  const cached = cacheGet('groups', TTL_GROUPS);
  if (cached) return cached;
  const res = await axios.get(`${getApiBaseUrl()}/api/bsuir/groups`);
  const data = res.data || [];
  cacheSet('groups', data);
  return data;
}

/**
 * Fetches raw content via backend proxy.
 * Support both JSON and XML depending on backend response.
 */
export async function fetchRaw(url) {
  const response = await axios.get(`${getApiBaseUrl()}/api/bsuir/proxy?url=${encodeURIComponent(url)}`);
  return response.data;
}

/**
 * Parses XML string into a DOM object.
 */
function parseXml(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const parseError = doc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    console.error("XML Parsing Error:", parseError[0].textContent);
    // Try to see if it's actually JSON and they lied
    try {
      const json = JSON.parse(xmlString);
      console.log("XML Parsing failed, but content is valid JSON. This shouldn't happen based on user rules, but let's check.");
    } catch(e) {}
  }
  return doc;
}

/**
 * Task 1: Parse Student Grades
 * @param {string} studentCardNumber 
 */
export async function getStudentGrades(studentCardNumber) {
  const url = `https://iis.bsuir.by/api/v1/rating/studentRating?studentCardNumber=${studentCardNumber}`;
  console.log("Fetching marks for card:", studentCardNumber);
  const data = await fetchRaw(url);
  
  const emptyResult = { subjects: [], omissions: { total_hours: 0, total_respectful_hours: 0, subjects: [] } };
  if (!data) return emptyResult;
  const processedIds = new Set();
  
  // Helper to extract omissions from lessons
  const extractOmissions = (lessons) => {
    const omissionsBySubject = {};
    let totalHours = 0;
    let totalRespectfulHours = 0;
    let totalNonRespectfulHours = 0;
    const records = []; // detailed per-lesson omission records
    
    lessons.forEach(l => {
      const sub = l.lessonNameAbbrev || l.subject || l.subjectAbbrev || l.name || 'Unknown';
      let omissions = l.gradeBookOmissions;
      if (omissions === undefined || omissions === null) omissions = 0;
      if (typeof omissions === 'string') omissions = parseInt(omissions, 10) || 0;
      if (typeof omissions !== 'number') omissions = 0;
      
      let isRespectful = l.isRespectfulOmission;
      if (typeof isRespectful === 'string') isRespectful = isRespectful.toLowerCase() === 'true';
      if (typeof isRespectful !== 'boolean') isRespectful = false;
      
      if (omissions > 0) {
        totalHours += omissions;
        if (isRespectful) {
          totalRespectfulHours += omissions;
        } else {
          totalNonRespectfulHours += omissions;
        }
        
        if (!omissionsBySubject[sub]) {
          omissionsBySubject[sub] = { skip_hours: 0, respectful_hours: 0, non_respectful_hours: 0, records: [] };
        }
        omissionsBySubject[sub].skip_hours += omissions;
        if (isRespectful) {
          omissionsBySubject[sub].respectful_hours += omissions;
        } else {
          omissionsBySubject[sub].non_respectful_hours += omissions;
        }
        
        const record = {
          date: l.dateString || null,
          lessonType: l.lessonTypeAbbrev || null,
          subject: sub,
          hours: omissions,
          isRespectful,
        };
        records.push(record);
        omissionsBySubject[sub].records.push(record);
      }
    });
    
    // Sort records by date (newest first)
    const sortByDate = (a, b) => {
      if (!a.date || !b.date) return 0;
      const [dA, mA, yA] = a.date.split('.').map(Number);
      const [dB, mB, yB] = b.date.split('.').map(Number);
      return (yB * 10000 + mB * 100 + dB) - (yA * 10000 + mA * 100 + dA);
    };
    records.sort(sortByDate);
    
    return {
      total_hours: totalHours,
      total_respectful_hours: totalRespectfulHours,
      total_non_respectful_hours: totalNonRespectfulHours,
      records,
      subjects: Object.entries(omissionsBySubject).map(([subject, data]) => ({
        subject,
        skip_hours: data.skip_hours,
        respectful_hours: data.respectful_hours,
        non_respectful_hours: data.non_respectful_hours,
        records: data.records.sort(sortByDate)
      }))
    };
  };
  
  // 1. If we already have an object or array (Axios parsed JSON), use it
  if (typeof data === 'object' && data !== null) {
    try {
      const lessons = Array.isArray(data) ? data : (data.lessons || []);
      const resMap = {};
      
      const extractMarks = (marksObj) => {
        if (marksObj === null || marksObj === undefined) return [];

        if (typeof marksObj === 'number') return [marksObj];
        if (typeof marksObj === 'string') {
          const trimmed = marksObj.trim();
          if (/^\d+$/.test(trimmed)) return [parseInt(trimmed, 10)];
          return [];
        }
        
        let found = [];
        if (Array.isArray(marksObj)) {
          marksObj.forEach(item => {
            found = found.concat(extractMarks(item));
          });
        } else if (typeof marksObj === 'object') {
          Object.entries(marksObj).forEach(([key, val]) => {
            if (key.toLowerCase() === 'id') return;
            if (key.toLowerCase().includes('id') && typeof val !== 'object') return;
            if (typeof val === 'number') found.push(val);
            else if (typeof val === 'string') {
              const trimmed = val.trim();
              if (/^\d+$/.test(trimmed)) found.push(parseInt(trimmed, 10));
              else if (typeof val === 'object') found = found.concat(extractMarks(val));
            }
            else if (typeof val === 'object') found = found.concat(extractMarks(val));
          });
        }
        return found;
      };

      // Extract omissions from all lessons (before dedup filtering)
      const omissions = extractOmissions(lessons);

      lessons.forEach(l => {
        if (!l.id || processedIds.has(l.id)) return;
        processedIds.add(l.id);

        const sub = l.lessonNameAbbrev || l.subject || l.subjectAbbrev || l.name || 'Unknown';
        const date = l.dateString || null;
        const lessonType = l.lessonTypeAbbrev || null;
        const ms = extractMarks(l.marks);
        
        if (ms.length > 0) {
          if (!resMap[sub]) resMap[sub] = [];
          // Wrap marks in objects with date and lessonType
          const marksWithDates = ms.map(val => ({ val, date, lessonType }));
          resMap[sub].push(...marksWithDates);
        }
      });
      
      const subjects = Object.entries(resMap).map(([subject, marks]) => ({ subject, marks }));
      return { subjects, omissions };
    } catch(e) {
      console.error("JSON processing error in getStudentGrades:", e);
    }
  }

  // 2. Fallback to XML parsing if it's a string
  const rawText = typeof data === 'string' ? data : JSON.stringify(data);
  const xml = parseXml(rawText);
  
  // To avoid catching the ROOT <lessons> container, we look for tags that have an <id> child.
  // We use a more specific selector strategy.
  const allPotentialLessons = Array.from(xml.getElementsByTagNameNS('*', 'lessons'))
                                   .concat(Array.from(xml.getElementsByTagName('lessons')))
                                   .concat(Array.from(xml.getElementsByTagNameNS('*', 'item')))
                                   .concat(Array.from(xml.getElementsByTagName('item')));
  
  const resultsMap = {};
  const seenUnitNodes = new Set();

  for (let i = 0; i < allPotentialLessons.length; i++) {
    const node = allPotentialLessons[i];
    if (seenUnitNodes.has(node)) continue;
    
    // A leaf lesson unit MUST have an <id> child that is a direct descendant.
    // If it doesn't have an ID, or if the ID is deep, it's likely a container.
    const directIdNode = Array.from(node.childNodes).find(child => 
      child.nodeType === 1 && (child.localName === 'id' || child.nodeName === 'id')
    );
    
    if (!directIdNode) continue;
    seenUnitNodes.add(node);

    const lessonId = directIdNode.textContent?.trim();
    if (lessonId && processedIds.has(lessonId)) continue;
    if (lessonId) processedIds.add(lessonId);

    const subjectNode = node.getElementsByTagNameNS('*', 'lessonNameAbbrev')[0] || 
                      node.getElementsByTagNameNS('*', 'subject')[0] ||
                      node.getElementsByTagName('lessonNameAbbrev')[0] ||
                      node.getElementsByTagName('subject')[0];
                      
    const subject = subjectNode?.textContent?.trim() || 'Unknown';
    
    const dateNode = node.getElementsByTagNameNS('*', 'dateString')[0] ||
                   node.getElementsByTagName('dateString')[0];
    const date = dateNode?.textContent?.trim() || null;
    
    // Find marks tags strictly within this node's immediate children to avoid aggregation
    const marksNodes = Array.from(node.childNodes).filter(child => 
      child.nodeType === 1 && (child.localName === 'marks' || child.nodeName === 'marks')
    );
    
    const rawMarksList = [];
    
    const collectLeafMarks = (mNode) => {
      // If it's a leaf node with text content, it's a mark
      if (mNode.children.length === 0) {
        const text = mNode.textContent?.trim();
        if (text && /^\d+$/.test(text) && text.length <= 2) {
          const val = parseInt(text, 10);
          if (!isNaN(val) && val >= 0 && val <= 10) rawMarksList.push(val);
        }

      } else {
        // Recurse into nested <marks>
        Array.from(mNode.childNodes).forEach(child => {
          if (child.nodeType === 1 && (child.localName === 'marks' || child.nodeName === 'marks')) {
            collectLeafMarks(child);
          }
        });
      }
    };

    marksNodes.forEach(collectLeafMarks);
    
    if (rawMarksList.length > 0) {
      if (!resultsMap[subject]) resultsMap[subject] = [];
      const marksWithDates = rawMarksList.map(val => ({ val, date }));
      resultsMap[subject].push(...marksWithDates);
    }

  }
  
  const subjects = Object.entries(resultsMap).map(([subject, marks]) => ({
    subject,
    marks: Array.isArray(marks) && typeof marks[0] === 'object' ? marks : marks.map(m => ({ val: m, date: null }))
  }));
  return { subjects, omissions: emptyResult.omissions };
}

/**
 * Task 2: Fetch Faculties
 */
export async function getFaculties() {
  const url = 'https://iis.bsuir.by/api/v1/faculties';
  const data = await fetchRaw(url);
  
  // If JSON (Array of objects)
  if (Array.isArray(data)) {
    return data.map(f => ({
      id: f.id,
      name: f.name,
      abbrev: f.abbrev
    }));
  }

  // Fallback to XML
  const xml = parseXml(typeof data === 'string' ? data : JSON.stringify(data));
  const items = xml.getElementsByTagNameNS('*', 'item');
  return Array.from(items).map(item => ({
    id: item.getElementsByTagNameNS('*', 'id')[0]?.textContent,
    name: item.getElementsByTagNameNS('*', 'name')[0]?.textContent,
    abbrev: item.getElementsByTagNameNS('*', 'abbrev')[0]?.textContent,
  }));
}

/**
 * Task 2: Fetch Specialities
 */
export async function getSpecialities(facultyId) {
  const url = `https://iis.bsuir.by/api/v1/specialities?facultyId=${facultyId}`;
  const data = await fetchRaw(url);
  
  if (Array.isArray(data)) {
    return data.map(s => ({
      id: s.id,
      name: s.name,
      abbrev: s.abbrev,
      facultyId: s.facultyId,
      educationForm: s.educationForm
    }));
  }

  const xml = parseXml(typeof data === 'string' ? data : JSON.stringify(data));
  const items = xml.getElementsByTagNameNS('*', 'item');
  return Array.from(items).map(item => ({
    id: item.getElementsByTagNameNS('*', 'id')[0]?.textContent, // This IS the sdef
    name: item.getElementsByTagNameNS('*', 'name')[0]?.textContent,
    abbrev: item.getElementsByTagNameNS('*', 'abbrev')[0]?.textContent,
    facultyId: item.getElementsByTagNameNS('*', 'facultyId')[0]?.textContent,
    educationForm: {
      id: item.getElementsByTagNameNS('*', 'educationForm')[0]?.getElementsByTagNameNS('*', 'id')[0]?.textContent,
      name: item.getElementsByTagNameNS('*', 'educationForm')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent,
    }
  }));
}

/**
 * Task 2: Fetch Active Specialities by cross-referencing with groups
 */
export async function getActiveSpecialities(facultyId) {
  const cacheKey = `activeSpecs:${facultyId}`;
  const cached = cacheGet(cacheKey, TTL_SPECS);
  if (cached) return cached;

  const activeGroups = await getCachedGroups();
  const activeSdefs = new Set(
    activeGroups
      .filter(g => String(g.facultyId) === String(facultyId))
      .map(g => g.specialityDepartmentEducationFormId)
  );

  const allSpecs = await getSpecialities(facultyId);
  const result = allSpecs.filter(s => activeSdefs.has(Number(s.id)));
  cacheSet(cacheKey, result);
  return result;
}

/**
 * Task 2: Fetch Courses - Derived from active groups
 */
export async function getCourses(facultyId, specialityId) {
  const activeGroups = await getCachedGroups();
  
  const courses = activeGroups
    .filter(g => 
      String(g.facultyId) === String(facultyId) && 
      Number(g.specialityDepartmentEducationFormId) === Number(specialityId)
    )
    .map(g => g.course);

  return [...new Set(courses)].sort((a, b) => a - b);
}

/**
 * Task 2: Fetch Rating (Leaderboard)
 */
export async function getRating(sdef, course) {
  const cacheKey = `rating:${sdef}:${course}`;
  const cached = cacheGet(cacheKey, TTL_RATING);
  if (cached) return cached;

  const url = `https://iis.bsuir.by/api/v1/rating?sdef=${sdef}&course=${course}`;
  const data = await fetchRaw(url);
  
  let result = [];
  if (Array.isArray(data)) {
    result = data.map(s => ({
      fio: s.fio,
      average: parseFloat(s.average || '0'),
      studentCardNumber: s.studentCardNumber
    }));
  } else {
    const xml = parseXml(typeof data === 'string' ? data : JSON.stringify(data));
    const items = xml.getElementsByTagNameNS('*', 'item');
    result = Array.from(items).map(item => ({
      fio: item.getElementsByTagNameNS('*', 'fio')[0]?.textContent,
      average: parseFloat(item.getElementsByTagNameNS('*', 'average')[0]?.textContent || '0'),
      studentCardNumber: item.getElementsByTagNameNS('*', 'studentCardNumber')[0]?.textContent,
    }));
  }
  
  result.sort((a, b) => b.average - a.average);
  cacheSet(cacheKey, result);
  return result;
}

import SDEF_MAP from '../data/sdefMap.json';

// Debug: check structure of SDEF_MAP
console.log('SDEF_MAP loaded. Keys count:', Object.keys(SDEF_MAP).length);
console.log('SDEF_MAP sample keys:', Object.keys(SDEF_MAP).slice(0, 5));

/**
 * Faculty digit (2nd digit of student card) → faculty name mapping.
 */
const FACULTY_DIGIT_MAP = {
  '1': 'ФКП',
  '2': 'ФИТУ',
  '3': 'ВФ',
  '4': 'ФРЭ',
  '5': 'ФКСиС',
  '6': 'ФИБ',
  '7': 'ИЭФ',
};

/**
 * Parse a 4-digit student card number into course, faculty, and specialty code.
 */
function parseStudentCard(cardNumber) {
  if (!cardNumber) return null;
  const clean = cardNumber.replace(/[^0-9]/g, '');
  console.log('Parsing student card:', clean);
  if (clean.length < 4) {
    console.warn('Card number too short:', clean.length);
    return null;
  }

  const admissionYearDigit = parseInt(clean[0], 10);
  const facultyDigit = clean[1];
  const specCode = clean.substring(2, 4);

  const facultyName = FACULTY_DIGIT_MAP[facultyDigit] || `Unknown (${facultyDigit})`;

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  let admissionYear = Math.floor(currentYear / 10) * 10 + admissionYearDigit;
  if (admissionYear > currentYear) admissionYear -= 10;

  let course = currentYear - admissionYear;
  if (currentMonth >= 8) course += 1;
  course = Math.max(1, Math.min(6, course));

  const result = { course, facultyName, facultyDigit, specCode, clean };
  console.log('Parsed card info:', result);
  return result;
}

/**
 * Look up all matching sdefs and spec_name from SDEF_MAP.
 * New SDEF_MAP structure: keys like "840", values have simple string fields:
 *   { faculty_code: "6", faculty_name: "...", spec_code: "84", spec_name: "...", study_form: "0", sdefs: [...] }
 */
function lookupSdefs(facultyDigit, specCode) {
  const allSdefs = new Set();
  let specName = null;
  let matchCount = 0;

  console.log(`Starting SDEF_MAP lookup for facultyDigit=${facultyDigit}, specCode=${specCode}`);

  for (const [key, entry] of Object.entries(SDEF_MAP)) {
    // Skip non-matching study forms
    if (entry.study_form !== '0') continue;

    // Strict faculty check
    if (entry.faculty_code && entry.faculty_code !== facultyDigit) continue;

    // Match by spec_code (2-digit string from student card digits 3+4)
    if (entry.spec_code !== specCode) continue;

    matchCount++;
    if (!specName) specName = entry.spec_name;
    if (Array.isArray(entry.sdefs)) {
      entry.sdefs.forEach(s => allSdefs.add(s));
    }
  }

  // Fallback: If no matches with strict faculty matching, try just specCode
  if (matchCount === 0) {
    console.log(`No matches with strict faculty check, trying just specCode=${specCode}...`);
    for (const [key, entry] of Object.entries(SDEF_MAP)) {
      if (entry.study_form !== '0') continue;
      if (entry.spec_code !== specCode) continue;
      
      matchCount++;
      if (!specName) specName = entry.spec_name;
      if (Array.isArray(entry.sdefs)) {
        entry.sdefs.forEach(s => allSdefs.add(s));
      }
    }
  }

  const result = { sdefs: [...allSdefs], specName };
  console.log(`Lookup finished. Matches: ${matchCount}, Unique sdefs: ${result.sdefs.length}, Spec: ${specName}`);
  return result;
}

function findStudentInLeaderboard(leaderboard, cardClean) {
  if (!leaderboard || leaderboard.length === 0) return null;
  const idx = leaderboard.findIndex(s => {
    const sCard = s.studentCardNumber?.replace(/[^0-9]/g, '');
    return sCard === cardClean
      || (sCard && cardClean.includes(sCard))
      || (sCard && sCard.includes(cardClean));
  });
  if (idx === -1) return null;
  return { rank: idx + 1, total: leaderboard.length, student: leaderboard[idx] };
}

export async function fetchStudentRating(cardNumber) {
  try {
    const parsed = parseStudentCard(cardNumber);
    if (!parsed) return null;
    const { course, facultyName, facultyDigit, specCode, clean } = parsed;

    const { sdefs, specName } = lookupSdefs(facultyDigit, specCode);
    if (sdefs.length === 0) {
      console.warn('No sdefs found in SDEF_MAP for this student info.');
      return null;
    }

    const cacheKey = `bsuir_rating_sdef_${clean}`;
    const cachedSdef = localStorage.getItem(cacheKey);

    if (cachedSdef && sdefs.includes(Number(cachedSdef))) {
      console.log('Using cached sdef:', cachedSdef);
      const leaderboard = await getRating(Number(cachedSdef), course);
      const result = findStudentInLeaderboard(leaderboard, clean);
      if (result) return { ...result, specName };
      console.log('Student not found in cached sdef leaderboard, trying all sdefs...');
      localStorage.removeItem(cacheKey);
    }

    console.log(`Fetching rating for ${sdefs.length} sdefs in parallel...`);
    const results = await Promise.all(
      sdefs.map(async (sdef) => {
        try {
          const lb = await getRating(sdef, course);
          return { sdef, leaderboard: lb };
        } catch (e) {
          console.error(`getRating failed for sdef=${sdef}:`, e);
          return { sdef, leaderboard: [] };
        }
      })
    );

    for (const { sdef, leaderboard } of results) {
      const found = findStudentInLeaderboard(leaderboard, clean);
      if (found) {
        localStorage.setItem(cacheKey, String(sdef));
        console.log('Student found! Saving sdef to cache.');
        return { ...found, specName };
      }
    }

    console.warn('Student not found in any of the fetched leaderboards.');
    return null;
  } catch (err) {
    console.error('Fatal error in fetchStudentRating:', err);
    return null;
  }
}
