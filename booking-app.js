(function(){
  const $ = (id) => document.getElementById(id);
  const form = $('bookingForm');
  const estimateBtn = $('estimateBtn');
  const submitBtn = $('submitBtn');
  const bookingOutcomeStatus = $('bookingOutcomeStatus');
  const serviceChips = $('serviceChips');
  const statusMsg = $('statusMsg');
  const estMiles = $('estMiles');
  const estDuration = $('estDuration');
  const estSubtotal = $('estSubtotal');
  const estTax = $('estTax');
  const estFare = $('estFare');
  const estMemberSavingsRow = $('estMemberSavingsRow');
  const estMemberSavings = $('estMemberSavings');
  const rateSourceLabel = $('rateSourceLabel');
  const memberDiscountNote = $('memberDiscountNote');
  const rateSettingsSection = $('rateSettingsSection');
  const rateBase = $('rateBase');
  const rateIncluded = $('rateIncluded');
  const ratePerMile = $('ratePerMile');
  const rateWait = $('rateWait');
  const saveRateBtn = $('saveRateBtn');
  const resetRateBtn = $('resetRateBtn');
  const telemetryMapEl = $('telemetryMap');
  const telemetryStatus = $('telemetryStatus');
  const telemetryRouteHint = $('telemetryRouteHint');
  const telemetryList = $('telemetryList');
  const telemetryRiderName = $('telemetryRiderName');
  const telemetryDriverName = $('telemetryDriverName');
  const telemetryMission = $('telemetryMission');
  const focusMyRouteOnly = $('focusMyRouteOnly');
  const paymentSection = $('paymentSection');
  const paymentSummary = $('paymentSummary');
  const paymentStatusMsg = $('paymentStatusMsg');
  const payStripeBtn = $('payStripeBtn');
  const paySquareBtn = $('paySquareBtn');
  const payDepositBtn = $('payDepositBtn');
  const payFullBtn = $('payFullBtn');
  const depositAmountLabel = $('depositAmountLabel');
  const fullAmountLabel = $('fullAmountLabel');
  const paymentChoiceHint = $('paymentChoiceHint');
  const fareSummaryAmount = $('fareSummaryAmount');
  const fareSummaryDistance = $('fareSummaryDistance');
  const fareSummaryEta = $('fareSummaryEta');
  const fareMemberSavingsRow = $('fareMemberSavingsRow');
  const fareMemberSavings = $('fareMemberSavings');
  const rideTypeSummary = $('rideTypeSummary');
  const bookingLoginSummary = $('bookingLoginSummary');
  const pickupDropoffSummary = $('pickupDropoffSummary');
  const confirmPickupDropoffBtn = $('confirmPickupDropoffBtn');
  const riderIdentityToggleWrap = $('riderIdentityToggleWrap');
  const riderIsDifferentToggle = $('riderIsDifferentToggle');
  const riderIdentityHint = $('riderIdentityHint');
  const confirmRiderBtn = $('confirmRiderBtn');
  const loginEmail = $('loginEmail');
  const loginPassword = $('loginPassword');
  const showPasswordToggle = $('showPasswordToggle');
  const authActionBtn = $('authActionBtn');
  const forgotPasswordBtn = $('forgotPasswordBtn');
  const forgotPasswordPanel = $('forgotPasswordPanel');
  const forgotPasswordEmail = $('forgotPasswordEmail');
  const sendResetPasswordBtn = $('sendResetPasswordBtn');
  const forgotPasswordMessage = $('forgotPasswordMessage');
  const forgotPasswordResetLink = $('forgotPasswordResetLink');
  const signUpBtn = $('signUpBtn');
  const signUpPanel = $('signUpPanel');
  const signupName = $('signupName');
  const signupPhone = $('signupPhone');
  const signupEmail = $('signupEmail');
  const signupPassword = $('signupPassword');
  const signupPasswordConfirm = $('signupPasswordConfirm');
  const signupPasswordStrength = $('signupPasswordStrength');
  const signupPasswordStrengthFill = $('signupPasswordStrengthFill');
  const signupPasswordStrengthText = $('signupPasswordStrengthText');
  const signupPasswordChecklist = $('signupPasswordChecklist');
  const createAccountBtn = $('createAccountBtn');
  const loginMessage = $('loginMessage');
  const authRoleBadge = $('authRoleBadge');
  const authStatusText = $('authStatusText');
  const riderDetailsSection = $('riderDetailsSection');
  const multipleStopsToggle = $('multipleStopsToggle');
  const stopCountSelect = $('stopCountSelect');
  const destinationRowsContainer = $('destinationRows');
  const pickupSuggestionsPanel = $('pickupSuggestionsPanel');
  const destinationSuggestionsPanel = $('destinationSuggestionsPanel');
  const completedSectionsToggleWrap = $('completedSectionsToggleWrap');
  const toggleCompletedSectionsBtn = $('toggleCompletedSectionsBtn');
  const toggleManageTripBtn = $('toggleManageTripBtn');
  const manageTripPanel = $('manageTripPanel');
  const manageReference = $('manageReference');
  const managePhone = $('managePhone');
  const manageLookupBtn = $('manageLookupBtn');
  const manageTripSummary = $('manageTripSummary');
  const manageRescheduleFields = $('manageRescheduleFields');
  const manageDate = $('manageDate');
  const manageTime = $('manageTime');
  const manageTripActions = $('manageTripActions');
  const manageRescheduleBtn = $('manageRescheduleBtn');
  const manageCancelBtn = $('manageCancelBtn');
  const manageTripMessage = $('manageTripMessage');

  const FALLBACK_PRICING = {
    wheelchair:{label:'Wheelchair Transportation',base:95,includedMiles:10,perMile:4.25,waitPer15:25},
    ambulatory:{label:'Ambulatory Transportation',base:65,includedMiles:5,perMile:3.25,waitPer15:20},
    facility_transfer:{label:'Facility-to-Facility Transfer (Routine IFT)',base:165,includedMiles:8,perMile:5.25,waitPer15:35},
    facility_transfer_critical:{label:'Facility-to-Facility Transfer (High-Acuity IFT)',base:340,includedMiles:8,perMile:8.75,waitPer15:50},
    broda:{label:'Broda Chair Transportation',base:145,includedMiles:10,perMile:5.25,waitPer15:25},
    stretcher:{label:'Stretcher Transportation',base:260,includedMiles:10,perMile:7.5,waitPer15:35},
    bariatric:{label:'Bariatric Transportation',base:385,includedMiles:10,perMile:9.5,waitPer15:45},
    bls:{label:'BLS Ambulance',base:725,includedMiles:0,perMile:17.5,waitPer15:55},
    als1:{label:'ALS I Ambulance',base:925,includedMiles:0,perMile:20,waitPer15:65},
    als2:{label:'ALS II Ambulance',base:1350,includedMiles:0,perMile:23,waitPer15:75}
  };

  const DEFAULT_FARE_RULES = {
    minimumFare: 0,
    fuelSurchargePerMile: 0,
    fuelPricingMode: 'MANUAL',
    fuelIndexPricePerGallon: 0,
    fuelBaselinePricePerGallon: 3.25,
    fuelEfficiencyMpg: 10,
    fuelOperationalBufferPct: 20,
    fuelLastUpdatedAt: null,
    afterHoursSurchargePct: 0,
    weekendSurchargePct: 0,
    holidaySurchargePct: 10,
    taxRatePct: 0,
    cancellationFee: 30,
    cancellationWindowHours: 24,
    cancellationLeadHours: 72,
    noShowFee: 50,
    freeWaitMinutes: 15,
    mileageRoundingRule: 'TENTH_MILE',
    telemetryRefreshSeconds: 20,
    maxBookingDistanceMiles: 125,
    returnMilesThreshold: 10,
    returnMilesInclusionPct: 100,
    trafficOverageFeePerHour: 0,
    trafficOverageGraceMinutes: 0,
    servicePolicies: {
      wheelchair:{cancellationFee:40,noShowFee:60,trafficOverageFeePerHour:25,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
      ambulatory:{cancellationFee:35,noShowFee:50,trafficOverageFeePerHour:20,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
      facility_transfer:{cancellationFee:85,noShowFee:115,trafficOverageFeePerHour:42,returnMilesInclusionPct:100,afterHoursSurchargePct:5,weekendSurchargePct:3,holidaySurchargePct:12},
      facility_transfer_critical:{cancellationFee:180,noShowFee:240,trafficOverageFeePerHour:75,returnMilesInclusionPct:100,afterHoursSurchargePct:8,weekendSurchargePct:5,holidaySurchargePct:15},
      broda:{cancellationFee:75,noShowFee:95,trafficOverageFeePerHour:35,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
      stretcher:{cancellationFee:120,noShowFee:150,trafficOverageFeePerHour:50,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
      bariatric:{cancellationFee:160,noShowFee:200,trafficOverageFeePerHour:65,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
      bls:{cancellationFee:200,noShowFee:260,trafficOverageFeePerHour:85,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
      als1:{cancellationFee:250,noShowFee:325,trafficOverageFeePerHour:95,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10},
      als2:{cancellationFee:300,noShowFee:390,trafficOverageFeePerHour:110,returnMilesInclusionPct:100,afterHoursSurchargePct:0,weekendSurchargePct:0,holidaySurchargePct:10}
    }
  };

  let mapsReadyPromise = null;
  let mapsEnabled = false;
  let mapsBrowserKey = '';
  let stripeEnabled = false;
  let squareEnabled = false;
  let estimateState = { miles: 0, durationText: '', durationMinutes: 0, trafficDurationMinutes: 0, subtotal: 0, taxAmount: 0, preDiscountFare: 0, memberSavings: 0, fare: 0 };
  let pickupAutocomplete = null;
  let destinationAutocomplete = null;
  let telemetryMap = null;
  let telemetryMarkers = new Map();
  let telemetryTimer = null;
  let customerRoutePolyline = null;
  let customerPickupMarker = null;
  let customerDestinationMarker = null;
  let customerRouteBounds = null;
  let isAdminUser = false;
  let currentUserRole = 'CUSTOMER';
  let currentUser = null;
  let platformPricing = null;
  let fareRules = { ...DEFAULT_FARE_RULES };
  let currentBookingReference = '';
  let currentBookingFare = 0;
  let bookingSubmitted = false;
  let destinationConfirmed = false;
  let riderDetailsConfirmed = false;
  let activeManagedBooking = null;
  let destinationStopDraftCache = [];
  const locationSuggestionCache = new Map();
  const routePointCache = new Map();
  let lastTelemetryVehicles = [];
  let lastTelemetryUsingLocalMock = false;
  let coreActionsBound = false;
  let authActionsBound = false;
  let manageActionsBound = false;
  const PRIVILEGED_SERVICE_ROLES = new Set(['ADMIN','DISPATCHER','FACILITY']);
  const CUSTOMER_ALLOWED_SERVICES = new Set(['ambulatory','wheelchair','stretcher','bariatric']);
  const AUTO_COLLAPSIBLE_SECTION_IDS = ['pickupDropoffSection', 'rideTypeSection'];
  const PROGRESSIVE_SECTIONS_ORDER = ['riderDetailsSection', 'pickupDropoffSection', 'rideTypeSection', 'telemetrySection', 'fareSummarySection'];
  const FINAL_HIDDEN_SECTION_IDS = ['bookingLoginSection', 'riderDetailsSection', 'pickupDropoffSection', 'rideTypeSection', 'rateSettingsSection', 'fareSummarySection'];
  const finalVisibleSectionIds = new Set(['telemetrySection', 'paymentSection']);
  const expandedSections = new Set();
  const riderDetailsInitiallyCollapsed = new Set(['riderDetailsSection']);
  const LOCATION_STATE_CODE = 'MD';
  const MARYLAND_SUFFIX = 'maryland';
  const DEFAULT_ROUTE_PICKUP = '155 Limpkin Ave, Clarksburg, MD 20871';
  const DEFAULT_ROUTE_DESTINATION = '2000 Medical Parkway, Annapolis, Maryland, 21401';
  const DEFAULT_MARYLAND_SUGGESTIONS = [
    '155 Limpkin Avenue, Clarksburg, Maryland, 20841',
    '2000 Medical Parkway, Annapolis, Maryland, 21401',
    '8600 Old Georgetown Rd, Bethesda, Maryland, 20814',
    '1800 Orleans St, Baltimore, Maryland, 21287',
    '22 S Greene St, Baltimore, Maryland, 21201',
    '201 E University Pkwy, Baltimore, Maryland, 21218',
    '9000 Franklin Square Dr, Baltimore, Maryland, 21237',
    '7500 Osler Dr, Towson, Maryland, 21204'
  ];
  const MEMBER_DISCOUNT_PCT = 5;
  const SIGNUP_CTA_LABEL = 'Sign Up & Save 5%';

  function isRiderRole(role){
    const normalized = String(role || '').toUpperCase();
    return normalized === 'PATIENT' || normalized === 'RIDER';
  }

  function getRiderFormSnapshot(){
    return {
      name: String($('name')?.value || '').trim(),
      phone: String($('phone')?.value || '').trim(),
      email: String($('email')?.value || '').trim(),
      notes: String($('notes')?.value || '').trim()
    };
  }

  function setRiderFormValues({ name = '', phone = '', email = '', notes = '' } = {}){
    if($('name')) $('name').value = String(name || '').trim();
    if($('phone')) $('phone').value = formatPhone(String(phone || '').trim());
    if($('email')) $('email').value = String(email || '').trim();
    if($('notes')) $('notes').value = String(notes || '').trim();
  }

  function applyRiderDetailsFromAuthUser(){
    const role = String(currentUserRole || '').toUpperCase();
    const userName = String(currentUser?.displayName || currentUser?.name || '').trim();
    const userPhone = String(currentUser?.phone || '').trim();
    const userEmail = String(currentUser?.email || '').trim();
    const current = getRiderFormSnapshot();

    if(isRiderRole(role)){
      const nextName = userName || current.name;
      const nextPhone = userPhone || current.phone;
      const nextEmail = userEmail || current.email;
      setRiderFormValues({ name: nextName, phone: nextPhone, email: nextEmail, notes: current.notes });
      riderDetailsConfirmed = Boolean(nextName && nextPhone);
      if(riderDetailsConfirmed){
        riderDetailsInitiallyCollapsed.add('riderDetailsSection');
        expandedSections.delete('riderDetailsSection');
      }else{
        riderDetailsInitiallyCollapsed.delete('riderDetailsSection');
        expandedSections.add('riderDetailsSection');
      }
      return;
    }

    setRiderFormValues({ name: '', phone: '', email: '', notes: '' });
    riderDetailsConfirmed = false;
    riderDetailsInitiallyCollapsed.delete('riderDetailsSection');
    expandedSections.add('riderDetailsSection');
  }

  function humanizeDriverHandle(value = ''){
    const raw = String(value || '').trim();
    if(!raw) return '';
    return raw
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((part) => part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : '')
      .join(' ')
      .trim();
  }

  function resolveTelemetryDriverName(vehicles = []){
    const ranked = Array.from(vehicles || []).sort((left, right) => {
      const score = (vehicle) => {
        const status = String(vehicle?.status || '').toUpperCase();
        if(status === 'ASSIGNED') return 0;
        if(status === 'EN_ROUTE') return 1;
        if(status === 'IN_TRANSIT') return 2;
        return 3;
      };
      return score(left) - score(right);
    });
    for(const vehicle of ranked){
      const explicit = humanizeDriverHandle(vehicle?.driverName || vehicle?.driver || vehicle?.operatorName || vehicle?.operator || vehicle?.crewName || vehicle?.assignedDriverName || '');
      if(explicit) return explicit;
    }
    const assigned = ranked.find((vehicle) => ['ASSIGNED', 'EN_ROUTE', 'IN_TRANSIT'].includes(String(vehicle?.status || '').toUpperCase()));
    if(assigned){
      const unitLabel = String(assigned.unit || assigned.id || '').trim();
      return unitLabel ? `Assigned via ${unitLabel}` : 'Driver assignment in progress';
    }
    return 'Dispatch assigning your driver';
  }

  function updateTelemetrySpotlight(){
    const riderName = String($('name')?.value || currentUser?.displayName || currentUser?.name || '').trim();
    if(telemetryRiderName) telemetryRiderName.textContent = riderName || 'Rider details pending';
    if(telemetryDriverName) telemetryDriverName.textContent = resolveTelemetryDriverName(lastTelemetryVehicles);
    if(telemetryMission){
      telemetryMission.textContent = riderDetailsConfirmed
        ? 'Nexus keeps the active route visible so transportation access stays clear, equitable, and easy to follow.'
        : 'Nexus coordinates each journey so visibility and support stay accessible from request through arrival.';
    }
  }

  function validatePasswordPolicy(password, email = '', name = ''){
    const pwd = String(password || '');
    if(pwd.length < 12) return 'Password must be at least 12 characters.';
    if(/\s/.test(pwd)) return 'Password cannot include spaces.';
    if(!/[A-Z]/.test(pwd)) return 'Password must include at least one uppercase letter.';
    if(!/[a-z]/.test(pwd)) return 'Password must include at least one lowercase letter.';
    if(!/[0-9]/.test(pwd)) return 'Password must include at least one number.';
    if(!/[^A-Za-z0-9]/.test(pwd)) return 'Password must include at least one symbol.';
    const normalizedEmailLocal = String(email || '').toLowerCase().split('@')[0];
    const normalizedName = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedPwd = pwd.toLowerCase();
    const normalizedPwdAlphaNum = normalizedPwd.replace(/[^a-z0-9]/g, '');
    if(normalizedEmailLocal && normalizedEmailLocal.length >= 3 && (normalizedPwd.includes(normalizedEmailLocal) || normalizedPwdAlphaNum.includes(normalizedEmailLocal))) return 'Password should not contain your email name.';
    if(normalizedName && normalizedName.length >= 4 && (normalizedPwd.includes(normalizedName) || normalizedPwdAlphaNum.includes(normalizedName))) return 'Password should not contain your name.';
    return '';
  }

  function evaluatePasswordStrength(password){
    const pwd = String(password || '');
    if(!pwd) return { score: 0, percent: 0, label: 'Enter a password to see strength', tone: 'weak' };
    let score = 0;
    if(pwd.length >= 12) score += 2;
    if(pwd.length >= 16) score += 1;
    if(/[A-Z]/.test(pwd)) score += 1;
    if(/[a-z]/.test(pwd)) score += 1;
    if(/[0-9]/.test(pwd)) score += 1;
    if(/[^A-Za-z0-9]/.test(pwd)) score += 1;
    const uniqueChars = new Set(pwd).size;
    if(uniqueChars >= 10) score += 1;

    const normalized = Math.max(0, Math.min(8, score));
    const percent = Math.round((normalized / 8) * 100);
    if(normalized <= 2) return { score: normalized, percent, label: 'Weak', tone: 'weak' };
    if(normalized <= 4) return { score: normalized, percent, label: 'Fair', tone: 'fair' };
    if(normalized <= 6) return { score: normalized, percent, label: 'Strong', tone: 'strong' };
    return { score: normalized, percent, label: 'Excellent', tone: 'excellent' };
  }

  function passwordChecklistState(password, email = '', name = ''){
    const pwd = String(password || '');
    const normalizedEmailLocal = String(email || '').toLowerCase().split('@')[0];
    const normalizedName = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedPwd = pwd.toLowerCase();
    const normalizedPwdAlphaNum = normalizedPwd.replace(/[^a-z0-9]/g, '');
    return {
      length: pwd.length >= 12,
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      digit: /[0-9]/.test(pwd),
      symbol: /[^A-Za-z0-9]/.test(pwd),
      noSpaces: !/\s/.test(pwd),
      noEmail: !(normalizedEmailLocal && normalizedEmailLocal.length >= 3 && (normalizedPwd.includes(normalizedEmailLocal) || normalizedPwdAlphaNum.includes(normalizedEmailLocal))),
      noName: !(normalizedName && normalizedName.length >= 4 && (normalizedPwd.includes(normalizedName) || normalizedPwdAlphaNum.includes(normalizedName)))
    };
  }

  function renderSignupPasswordChecklist(){
    if(!signupPasswordChecklist) return;
    const state = passwordChecklistState(
      signupPassword?.value || '',
      signupEmail?.value || '',
      signupName?.value || ''
    );
    Array.from(signupPasswordChecklist.querySelectorAll('li[data-rule]')).forEach((item) => {
      const key = String(item.dataset.rule || '');
      if(!key) return;
      const isMet = Boolean(state[key]);
      item.classList.toggle('met', isMet);
      item.setAttribute('aria-checked', isMet ? 'true' : 'false');
    });
  }

  function renderSignupPasswordStrength(){
    if(!signupPasswordStrength || !signupPasswordStrengthFill || !signupPasswordStrengthText) return;
    const strength = evaluatePasswordStrength(signupPassword?.value || '');
    signupPasswordStrengthFill.style.width = `${strength.percent}%`;
    signupPasswordStrength.dataset.tone = strength.tone;
    signupPasswordStrengthText.textContent = `Strength: ${strength.label}`;
    renderSignupPasswordChecklist();
  }

  const autoEstimate = debounce(async() => {
    const pickup = $('pickup').value.trim();
    const destination = $('destination').value.trim();
    if(!pickup || !destination){
      resetEstimateUi();
      return;
    }
    try{
      await estimateRouteAndFare();
    }catch{}
  }, 250);

  function filterSuggestionsForQuery(suggestions, query){
    const terms = normalizeLocationText(query).split(/\s+/).filter(Boolean);
    if(!terms.length) return suggestions.slice(0, 8);
    return suggestions.filter((value) => {
      const normalized = normalizeLocationText(value);
      return terms.every((term) => normalized.includes(term));
    }).slice(0, 8);
  }

  function setStatus(message, type){
    statusMsg.textContent = message;
    statusMsg.className = `msg ${type}`;
  }

  function setBookingOutcome(message, type){
    if(!bookingOutcomeStatus) return;
    bookingOutcomeStatus.textContent = String(message || '');
    if(!message){
      bookingOutcomeStatus.className = 'bookingOutcome';
      return;
    }
    bookingOutcomeStatus.className = `bookingOutcome show ${type === 'confirmed' ? 'confirmed' : 'pending'}`;
  }

  function clearStatus(){
    statusMsg.textContent = '';
    statusMsg.className = 'msg';
  }

  function setPaymentMessage(message, isError = false){
    if(!paymentStatusMsg) return;
    paymentStatusMsg.textContent = message || '';
    paymentStatusMsg.style.color = isError ? 'var(--err)' : 'var(--muted)';
  }

  function setManageTripMessage(message, isError = false){
    if(!manageTripMessage) return;
    manageTripMessage.textContent = String(message || '');
    manageTripMessage.style.color = isError ? 'var(--err)' : 'var(--muted)';
  }

  function pricingWithMembership(baseTotal){
    const fullFare = Math.max(0, Number(baseTotal || 0));
    const signedIn = Boolean(token());
    const memberSavings = signedIn ? fullFare * (MEMBER_DISCOUNT_PCT / 100) : 0;
    const total = Math.max(0, fullFare - memberSavings);
    return { fullFare, memberSavings, total, signedIn };
  }

  function renderFareEstimateBreakdown(breakdown, miles, durationText, durationMinutes = 0, trafficDurationMinutes = 0){
    const discountView = pricingWithMembership(breakdown.total);
    estimateState = {
      miles: Math.max(0, Number(miles || 0)),
      durationText: String(durationText || ''),
      durationMinutes: Math.max(0, Number(durationMinutes || 0)),
      trafficDurationMinutes: Math.max(0, Number(trafficDurationMinutes || 0)),
      subtotal: Number(breakdown.subtotal || 0),
      taxAmount: Number(breakdown.taxAmount || 0),
      preDiscountFare: discountView.fullFare,
      memberSavings: discountView.memberSavings,
      fare: discountView.total
    };

    estMiles.textContent = `${estimateState.miles.toFixed(1)} mi`;
    estDuration.textContent = durationText || '-';
    if(estSubtotal) estSubtotal.textContent = `$${Number(breakdown.subtotal || 0).toFixed(2)}`;
    if(estTax) estTax.textContent = `$${Number(breakdown.taxAmount || 0).toFixed(2)}${Number(breakdown.taxRatePct || 0) > 0 ? ` (${Number(breakdown.taxRatePct || 0).toFixed(2)}%)` : ''}`;
    if(estMemberSavingsRow) estMemberSavingsRow.hidden = !discountView.signedIn;
    if(estMemberSavings) estMemberSavings.textContent = discountView.signedIn ? `-$${discountView.memberSavings.toFixed(2)}` : '-';
    estFare.textContent = `$${discountView.total.toFixed(2)}`;
    if(fareMemberSavingsRow) fareMemberSavingsRow.hidden = !discountView.signedIn;
    if(fareMemberSavings) fareMemberSavings.textContent = discountView.signedIn ? `-$${discountView.memberSavings.toFixed(2)}` : '-';
    if(memberDiscountNote){
      memberDiscountNote.textContent = discountView.signedIn
        ? `Member savings active: you are getting ${MEMBER_DISCOUNT_PCT}% off this ride and every ride.`
        : `Unlock instant ${MEMBER_DISCOUNT_PCT}% savings on every ride. Sign up now.`;
    }
  }

  function refreshFareForMembership(){
    const subtotal = Number(estimateState.subtotal || 0);
    const taxAmount = Number(estimateState.taxAmount || 0);
    if(subtotal <= 0 && taxAmount <= 0 && Number(estimateState.fare || 0) <= 0) return;
    renderFareEstimateBreakdown({
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      taxRatePct: Number(fareRules.taxRatePct || 0)
    }, estimateState.miles, estimateState.durationText || '-', estimateState.durationMinutes, estimateState.trafficDurationMinutes);
  }

  function setBusy(button, isBusy, busyText, idleText){
    button.disabled = isBusy;
    button.textContent = isBusy ? busyText : idleText;
  }

  function markDestinationConfirmed(){
    destinationConfirmed = true;
  }

  function markDestinationUnconfirmed(){
    destinationConfirmed = false;
  }

  function isMultipleStopsEnabled(){
    return Boolean(multipleStopsToggle?.checked);
  }

  function getStopCount(){
    const selected = Number(stopCountSelect?.value || 2);
    return Number.isFinite(selected) ? Math.max(2, Math.min(5, selected)) : 2;
  }

  function getDestinationInputs(){
    return [
      $('destination'),
      ...Array.from(destinationRowsContainer?.querySelectorAll('[data-route-stop="true"]') || [])
    ].filter(Boolean);
  }

  function getRouteDestinations(){
    return getDestinationInputs().map((input) => String(input.value || '').trim()).filter(Boolean);
  }

  function getRouteStops(){
    const pickup = String($('pickup')?.value || '').trim();
    return [pickup, ...getRouteDestinations()].filter(Boolean);
  }

  function areDestinationRowsFilled(){
    const inputs = getDestinationInputs();
    if(!inputs.length) return false;
    return inputs.every((input) => String(input.value || '').trim().length > 0);
  }

  function bindRouteFieldListeners(input, routeField){
    if(!input || input.dataset.routeListenersBound === 'true') return;
    input.dataset.routeListenersBound = 'true';
    ['change', 'input', 'blur'].forEach((eventName) => {
      input.addEventListener(eventName, () => {
        if(routeField === 'pickup' || routeField === 'destination'){
          expandedSections.delete('pickupDropoffSection');
          markDestinationUnconfirmed();
          updateTelemetryRouteHint();
          autoEstimate();
        }
        syncSectionProgressUi();
      });
    });
  }

  function buildDestinationRow(index, value = ''){
    const row = document.createElement('div');
    row.className = 'field autocompleteField';
    row.dataset.routeStopRow = 'true';
    row.innerHTML = `
      <label for="destination-${index}">Destination ${index}</label>
      <input id="destination-${index}" data-route-stop="true" data-route-field="destination" placeholder="Destination address" autocomplete="off" required>
      <div id="destinationSuggestions-${index}" class="suggestions" hidden></div>
    `;
    const input = row.querySelector('input');
    const panel = row.querySelector('.suggestions');
    if(input) input.value = value;
    bindRouteFieldListeners(input, 'destination');
    bindSuggestionAutocompleteToElements(input, panel, `destination-${index}`);
    return row;
  }

  function syncMultipleStopsUi(){
    if(!multipleStopsToggle || !stopCountSelect || !destinationRowsContainer) return;
    const enabled = isMultipleStopsEnabled();
    stopCountSelect.disabled = !enabled;

    const existingValues = Array.from(destinationRowsContainer.querySelectorAll('[data-route-stop="true"]')).map((input) => String(input.value || '').trim());
    if(existingValues.length) destinationStopDraftCache = existingValues;
    const desiredCount = enabled ? getStopCount() : 1;

    destinationRowsContainer.innerHTML = '';
    if(enabled){
      for(let index = 2; index <= desiredCount; index += 1){
        const row = buildDestinationRow(index, destinationStopDraftCache[index - 2] || '');
        destinationRowsContainer.appendChild(row);
      }
    }

    updateTelemetryRouteHint();
    syncSectionProgressUi();
  }

  function confirmPickupDropoffDetails(){
    const pickup = String($('pickup')?.value || '').trim();
    const destinations = getRouteDestinations();
    const destinationReady = isMultipleStopsEnabled() ? areDestinationRowsFilled() : Boolean(destinations[0]);
    if(!pickup || !destinationReady){
      setStatus('Enter pickup and all destination stops, then confirm details.', 'err');
      markDestinationUnconfirmed();
      syncSectionProgressUi();
      return;
    }
    markDestinationConfirmed();
    expandedSections.delete('pickupDropoffSection');
    setStatus('Pickup and destination confirmed.', 'ok');
    syncSectionProgressUi();
  }

  function token(){
    return String(sessionStorage.getItem('nexusAccessToken') || '');
  }

  function clearAuthSession(){
    sessionStorage.removeItem('nexusAccessToken');
    sessionStorage.removeItem('nexusUser');
  }

  function isPrivilegedServiceRole(role){
    return PRIVILEGED_SERVICE_ROLES.has(String(role || '').toUpperCase());
  }

  function allVisibleServices(){
    return Array.from(serviceChips.querySelectorAll('.chip')).map((chip) => normalizeService(chip.dataset.service)).filter(Boolean);
  }

  function allowedServicesForRole(role){
    if(isPrivilegedServiceRole(role)) return new Set(allVisibleServices());
    return new Set(CUSTOMER_ALLOWED_SERVICES);
  }

  function setLoginMessage(message, isError=false){
    if(!loginMessage) return;
    loginMessage.textContent = String(message || '');
    loginMessage.style.color = isError ? 'var(--err)' : 'var(--muted)';
  }

  function setForgotPasswordMessage(message, isError = false, resetUrl = ''){
    if(forgotPasswordMessage){
      forgotPasswordMessage.textContent = String(message || '');
      forgotPasswordMessage.style.color = isError ? 'var(--err)' : 'var(--muted)';
    }
    if(forgotPasswordResetLink){
      const url = String(resetUrl || '').trim();
      forgotPasswordResetLink.hidden = !url;
      forgotPasswordResetLink.href = url || '#';
    }
  }

  function applyServiceVisibility(){
    const allowed = allowedServicesForRole(currentUserRole);
    const chips = Array.from(serviceChips.querySelectorAll('.chip'));
    chips.forEach((chip) => {
      const service = normalizeService(chip.dataset.service);
      const canUse = allowed.has(service);
      chip.hidden = !canUse;
      chip.disabled = !canUse;
      if(!canUse) chip.classList.remove('active');
    });

    const current = normalizeService($('service').value);
    if(!allowed.has(current)){
      const fallbackChip = chips.find((chip) => !chip.hidden && !chip.disabled);
      if(fallbackChip){
        $('service').value = normalizeService(fallbackChip.dataset.service);
      }
    }
  }

  function applyAuthUi(){
    const role = String(currentUserRole || 'CUSTOMER').toUpperCase();
    const signedIn = Boolean(token());
    if(authRoleBadge) authRoleBadge.textContent = signedIn ? role : 'CUSTOMER';
    if(authStatusText){
      if(isPrivilegedServiceRole(role)) authStatusText.textContent = `Signed in as ${role}. You can view all ride types.`;
      else if(signedIn) authStatusText.textContent = `Signed in as ${role}. Member rate is active: ${MEMBER_DISCOUNT_PCT}% off every ride.`;
      else authStatusText.textContent = `Book as guest anytime. Sign up to save ${MEMBER_DISCOUNT_PCT}% on every ride.`;
    }
    if(authActionBtn){
      authActionBtn.textContent = signedIn ? 'Sign Out' : 'Sign In';
      authActionBtn.setAttribute('aria-label', signedIn ? 'Sign out' : 'Sign in');
    }
    if(signUpBtn){
      signUpBtn.hidden = signedIn;
      if(signedIn){
        signUpBtn.textContent = SIGNUP_CTA_LABEL;
        if(signUpPanel) signUpPanel.hidden = true;
      }
    }
    if(memberDiscountNote){
      memberDiscountNote.textContent = signedIn
        ? `Member savings active: you are getting ${MEMBER_DISCOUNT_PCT}% off this ride and every ride.`
        : `Unlock instant ${MEMBER_DISCOUNT_PCT}% savings on every ride. Sign up now.`;
    }
    applyServiceVisibility();
    applyRateVisibility();
    syncRiderIdentityMode();
    syncSectionProgressUi();
  }

  function syncRiderIdentityMode(){
    const nameInput = $('name');
    const phoneInput = $('phone');
    const emailInput = $('email');
    if(nameInput) nameInput.readOnly = false;
    if(phoneInput) phoneInput.readOnly = false;
    if(emailInput) emailInput.readOnly = false;
  }

  function setSectionCollapsed(sectionId, shouldCollapse){
    const section = $(sectionId);
    if(!section) return;
    const currentlyCollapsed = section.classList.contains('sectionCollapsed');
    if(shouldCollapse === currentlyCollapsed) return;
    section.classList.toggle('sectionCollapsed', shouldCollapse);
  }

  function revealSectionForAction(sectionId, focusId = ''){
    if(!sectionId) return;
    document.body.classList.add('showCompletedSections');
    expandedSections.add(sectionId);
    if(sectionId === 'riderDetailsSection') riderDetailsInitiallyCollapsed.delete('riderDetailsSection');
    setSectionCollapsed(sectionId, false);
    syncSectionProgressUi();

    const focusTarget = $(focusId) || $(sectionId);
    if(focusTarget?.scrollIntoView){
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if(focusTarget?.focus){
      focusTarget.focus();
    }
  }

  function getProgressState(){
    const riderDetailsComplete = riderDetailsConfirmed;
    const pickupComplete = riderDetailsComplete && Boolean(String($('pickup')?.value || '').trim() && getRouteDestinations().length > 0 && destinationConfirmed && areDestinationRowsFilled());
    const rideTypeComplete = pickupComplete && Boolean(normalizeService($('service')?.value) && $('tripDate')?.value && $('tripTime')?.value);
    const allRequiredComplete = pickupComplete && rideTypeComplete && riderDetailsConfirmed;
    return {
      riderDetailsSection: riderDetailsComplete,
      pickupDropoffSection: pickupComplete,
      rideTypeSection: rideTypeComplete,
      allRequiredComplete
    };
  }

  function syncSectionProgressUi(){
    const progress = getProgressState();
    updateTelemetrySpotlight();
    if(fareSummaryAmount){
      fareSummaryAmount.textContent = String(estFare?.textContent || '-');
    }
    if(fareSummaryDistance){
      fareSummaryDistance.textContent = String(estMiles?.textContent || '-');
    }
    if(fareSummaryEta){
      fareSummaryEta.textContent = String(estDuration?.textContent || '-');
    }
    if(rideTypeSummary){
      const selected = normalizeService($('service')?.value);
      const selectedChip = Array.from(serviceChips?.querySelectorAll('.chip') || []).find((chip) => normalizeService(chip.dataset.service) === selected);
      const serviceLabel = String(selectedChip?.textContent || selected || 'Ambulatory').trim();
      const dateLabel = String($('tripDate')?.value || '-').trim() || '-';
      const timeLabel = String($('tripTime')?.value || '-').trim() || '-';
      rideTypeSummary.textContent = `Service: ${serviceLabel} | Date: ${dateLabel} | Time: ${timeLabel}`;
    }
    if(bookingLoginSummary){
      const riderName = String($('name')?.value || '').trim();
      bookingLoginSummary.textContent = `Passenger: ${riderName || '-'}`;
    }
    if(pickupDropoffSummary){
      const pickup = String($('pickup')?.value || '').trim() || '-';
      const destinations = getRouteDestinations();
      const destinationSummary = destinations.length ? destinations.map((value, index) => `Destination ${index + 1}: ${value}`).join('\n') : 'Destination: -';
      pickupDropoffSummary.textContent = `Pickup: ${pickup}\n${destinationSummary}`;
    }

    AUTO_COLLAPSIBLE_SECTION_IDS.forEach((sectionId) => {
      const isComplete = Boolean(progress[sectionId]);
      const keepOpen = expandedSections.has(sectionId);
      const shouldCollapse = isComplete && !keepOpen;
      setSectionCollapsed(sectionId, shouldCollapse);
    });

    PROGRESSIVE_SECTIONS_ORDER.forEach((sectionId, index) => {
      const section = $(sectionId);
      if(!section || !section.classList.contains('sectionProgressive')) return;
      
      let shouldUnlock = false;
      
      if(sectionId === 'riderDetailsSection'){
        // First progressive section - always unlocked
        shouldUnlock = true;
      }else if(sectionId === 'pickupDropoffSection'){
        // Unlock when Rider Details is confirmed
        shouldUnlock = riderDetailsConfirmed;
      }else if(sectionId === 'rideTypeSection'){
        // Unlock when Pickup/Destination is confirmed
        shouldUnlock = destinationConfirmed;
      }else if(sectionId === 'telemetrySection' || sectionId === 'fareSummarySection'){
        // Unlock when Type of Ride is complete (fields filled)
        const rideTypeComplete = Boolean(normalizeService($('service')?.value) && $('tripDate')?.value && $('tripTime')?.value);
        shouldUnlock = destinationConfirmed && rideTypeComplete;
      }
      
      if(shouldUnlock){
        section.classList.add('unlocked');
      }else{
        section.classList.remove('unlocked');
      }
    });

    if(riderDetailsSection){
      const riderDetailsKeepOpen = expandedSections.has('riderDetailsSection');
      const shouldCollapseRiderDetails = (riderDetailsInitiallyCollapsed.has('riderDetailsSection') || riderDetailsConfirmed) && !riderDetailsKeepOpen;
      setSectionCollapsed('riderDetailsSection', shouldCollapseRiderDetails);
    }

    const finalView = Boolean(progress.allRequiredComplete || bookingSubmitted);
    document.body.classList.toggle('bookingFinalView', finalView);

    if(paymentSection){
      const hasBookingReference = Boolean(String(currentBookingReference || '').trim());
      if(bookingSubmitted && hasBookingReference){
        paymentSection.hidden = false;
      }else if(finalView){
        paymentSection.hidden = true;
        if(!hasBookingReference){
          paymentSummary.textContent = 'Complete payment after your booking reference is created.';
          payStripeBtn.hidden = false;
          paySquareBtn.hidden = true;
          payStripeBtn.disabled = true;
          paySquareBtn.disabled = true;
          setPaymentMessage('Submit booking to enable Stripe checkout.');
        }
      }else if(!hasBookingReference){
        paymentSection.hidden = true;
        setPaymentMessage('');
      }
    }

    FINAL_HIDDEN_SECTION_IDS.forEach((sectionId) => {
      const section = $(sectionId);
      if(!section) return;
      const isComplete = Object.prototype.hasOwnProperty.call(progress, sectionId) ? Boolean(progress[sectionId]) : true;
      const shouldHide = bookingSubmitted ? true : finalView && isComplete;
      section.classList.toggle('sectionHiddenInFinal', shouldHide);
    });

    if(completedSectionsToggleWrap){
      if(bookingSubmitted){
        completedSectionsToggleWrap.hidden = true;
      }
      const hasHiddenSections = FINAL_HIDDEN_SECTION_IDS.some((sectionId) => {
        const section = $(sectionId);
        return Boolean(section?.classList.contains('sectionHiddenInFinal'));
      });
      if(!bookingSubmitted) completedSectionsToggleWrap.hidden = !hasHiddenSections;
      if(toggleCompletedSectionsBtn){
        const showingCompleted = document.body.classList.contains('showCompletedSections');
        toggleCompletedSectionsBtn.textContent = showingCompleted ? 'Hide completed sections' : 'Show completed sections';
      }
    }

    finalVisibleSectionIds.forEach((sectionId) => {
      const section = $(sectionId);
      if(section) section.classList.remove('sectionHiddenInFinal');
    });

    if(submitBtn){
      submitBtn.hidden = bookingSubmitted && Boolean(String(currentBookingReference || '').trim());
    }
  }

  function bindSectionProgressTracking(){
    AUTO_COLLAPSIBLE_SECTION_IDS.forEach((sectionId) => {
      const section = $(sectionId);
      if(!section || section.querySelector('.sectionEditBtn')) return;
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'sectionEditBtn';
      editButton.textContent = 'Edit this section';
      editButton.addEventListener('click', () => {
        expandedSections.add(sectionId);
        section.classList.remove('sectionCollapsed');
        const firstInput = section.querySelector('input, textarea, select, button');
        if(firstInput) firstInput.focus();
      });
      section.appendChild(editButton);
    });

    if(riderDetailsSection && !riderDetailsSection.querySelector('.sectionEditBtn')){
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'sectionEditBtn';
      editButton.textContent = 'Edit this section';
      editButton.addEventListener('click', () => {
        expandedSections.add('riderDetailsSection');
        riderDetailsInitiallyCollapsed.delete('riderDetailsSection');
        riderDetailsSection.classList.remove('sectionCollapsed');
        const firstInput = riderDetailsSection.querySelector('input, textarea, select, button');
        if(firstInput) firstInput.focus();
      });
      riderDetailsSection.appendChild(editButton);
    }

    if(toggleCompletedSectionsBtn){
      toggleCompletedSectionsBtn.addEventListener('click', () => {
        const next = !document.body.classList.contains('showCompletedSections');
        document.body.classList.toggle('showCompletedSections', next);
        syncSectionProgressUi();
      });
    }

    ['tripDate', 'tripTime', 'name', 'phone', 'email', 'notes'].forEach((id) => {
      const field = $(id);
      if(!field) return;
      ['change', 'input', 'blur'].forEach((eventName) => {
        field.addEventListener(eventName, () => {
          if(id === 'tripDate' || id === 'tripTime') expandedSections.delete('rideTypeSection');
          if(id === 'name' || id === 'phone' || id === 'email' || id === 'notes'){
            riderDetailsInitiallyCollapsed.delete('riderDetailsSection');
            expandedSections.delete('riderDetailsSection');
            riderDetailsConfirmed = false;
          }
          if(id === 'phone' && (eventName === 'change' || eventName === 'blur')) formatPhoneField();
          syncSectionProgressUi();
        });
      });
    });

    if(loginEmail) loginEmail.addEventListener('input', () => syncSectionProgressUi());
    if(loginPassword) loginPassword.addEventListener('input', () => syncSectionProgressUi());
  }

  function confirmRiderDetails(){
    const name = String($('name')?.value || '').trim();
    const phone = String($('phone')?.value || '').trim();
    if(!name || !phone){
      setStatus('Enter passenger name and phone, then confirm details.', 'err');
      riderDetailsConfirmed = false;
      syncSectionProgressUi();
      return;
    }
    riderDetailsConfirmed = true;
    expandedSections.delete('riderDetailsSection');
    setStatus('Rider details confirmed.', 'ok');
    syncSectionProgressUi();
  }

  function normalizeLocationText(value){
    let text = String(value || '').toLowerCase();
    const replacements = [
      [/\bst\.?\b/g, 'street'],
      [/\bave\.?\b/g, 'avenue'],
      [/\brd\.?\b/g, 'road'],
      [/\bdr\.?\b/g, 'drive'],
      [/\bblvd\.?\b/g, 'boulevard'],
      [/\bln\.?\b/g, 'lane'],
      [/\bct\.?\b/g, 'court'],
      [/\bpl\.?\b/g, 'place'],
      [/\bpkwy\.?\b/g, 'parkway'],
      [/\bhwy\.?\b/g, 'highway'],
      [/\btrl\.?\b/g, 'trail'],
      [/\bcir\.?\b/g, 'circle']
    ];
    for(const [pattern, replacement] of replacements){
      text = text.replace(pattern, replacement);
    }
    return text.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function withMarylandQuery(value){
    const raw = String(value || '').trim();
    if(!raw) return raw;
    const normalized = normalizeLocationText(raw);
    if(normalized.includes(MARYLAND_SUFFIX) || /\bmd\b/i.test(raw)) return raw;
    return `${raw}, Maryland`;
  }

  function locationSearchUrl(query){
    const scopedQuery = withMarylandQuery(query);
    return `/api/locations/search?q=${encodeURIComponent(scopedQuery)}&state=${LOCATION_STATE_CODE}`;
  }

  function getDefaultMarylandSuggestions(query){
    const normalizedQuery = normalizeLocationText(query || 'Maryland');
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return DEFAULT_MARYLAND_SUGGESTIONS.filter((value) => {
      const haystack = normalizeLocationText(value);
      return terms.every((term) => haystack.includes(term));
    }).slice(0, 8);
  }

  function updateTelemetryRouteHint(){
    if(!telemetryRouteHint) return;
    const stops = getRouteStops();
    if(stops.length >= 2){
      telemetryRouteHint.textContent = `Route preview: ${stops.join(' -> ')}`;
      if(!telemetryMap){
        Promise.resolve(resolveFallbackRoutePoints()).then((routePoints) => {
          renderTelemetryFallback(lastTelemetryVehicles, lastTelemetryUsingLocalMock, routePoints);
        }).catch(() => {});
      }
      return;
    }
    telemetryRouteHint.textContent = `Default route preview: ${DEFAULT_ROUTE_PICKUP} -> ${DEFAULT_ROUTE_DESTINATION}`;
    if(!telemetryMap){
      Promise.resolve(resolveFallbackRoutePoints()).then((routePoints) => {
        renderTelemetryFallback(lastTelemetryVehicles, lastTelemetryUsingLocalMock, routePoints);
      }).catch(() => {});
    }
  }

  function seedDefaultRouteIfEmpty(){
    const pickupInput = $('pickup');
    const destinationInput = $('destination');
    if(!pickupInput || !destinationInput) return false;
    let seeded = false;
    if(!String(pickupInput.value || '').trim()){
      pickupInput.value = DEFAULT_ROUTE_PICKUP;
      seeded = true;
    }
    if(!String(destinationInput.value || '').trim()){
      destinationInput.value = DEFAULT_ROUTE_DESTINATION;
      seeded = true;
    }
    updateTelemetryRouteHint();
    return seeded;
  }

  function isLocalHost(){
    const host = String(window.location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  }

  function localMockVehicles(){
    const now = Date.now();
    const phase = (now / 15000) % 1;
    const baseLat = 39.0458;
    const baseLng = -76.6413;
    const templates = [
      { id: 'BUS-01', status: 'EN_ROUTE', speed: 34, latOffset: 0.018, lngOffset: 0.012, latDrift: 0.010, lngDrift: 0.009, driverName: 'Noah Bennett' },
      { id: 'BUS-02', status: 'IN_TRANSIT', speed: 29, latOffset: -0.014, lngOffset: 0.021, latDrift: 0.009, lngDrift: -0.008, driverName: 'Mia Carter' },
      { id: 'VAN-01', status: 'ASSIGNED', speed: 22, latOffset: 0.006, lngOffset: 0.026, latDrift: 0.006, lngDrift: -0.005, driverName: 'Jordan Ellis' },
      { id: 'VAN-02', status: 'EN_ROUTE', speed: 26, latOffset: -0.022, lngOffset: -0.006, latDrift: 0.007, lngDrift: 0.004, driverName: 'Avery Brooks' },
      { id: 'VAN-03', status: 'AVAILABLE', speed: 0, latOffset: 0.011, lngOffset: -0.019, latDrift: 0, lngDrift: 0 },
      { id: 'VAN-04', status: 'IN_TRANSIT', speed: 28, latOffset: -0.004, lngOffset: 0.033, latDrift: 0.007, lngDrift: -0.006, driverName: 'Taylor Morgan' },
      { id: 'VAN-05', status: 'ARRIVED', speed: 0, latOffset: 0.027, lngOffset: -0.028, latDrift: 0, lngDrift: 0 },
      { id: 'VAN-06', status: 'EN_ROUTE', speed: 24, latOffset: -0.03, lngOffset: 0.011, latDrift: 0.008, lngDrift: 0.005 },
      { id: 'AMB-01', status: 'IN_TRANSIT', speed: 36, latOffset: 0.02, lngOffset: -0.004, latDrift: -0.009, lngDrift: 0.006, driverName: 'Cameron Reed' },
      { id: 'AMB-02', status: 'AVAILABLE', speed: 0, latOffset: -0.012, lngOffset: -0.024, latDrift: 0, lngDrift: 0 }
    ];

    return templates.map((tpl, idx) => {
      const wave = (phase + (idx * 0.09)) % 1;
      return {
        id: tpl.id,
        unit: tpl.id,
        status: tpl.status,
        driverName: tpl.driverName || '',
        lat: baseLat + tpl.latOffset + (wave * tpl.latDrift),
        lng: baseLng + tpl.lngOffset + (wave * tpl.lngDrift),
        speed: tpl.speed
      };
    });
  }

  function haversineMiles(origin, destination){
    const toRadians = (value) => Number(value) * Math.PI / 180;
    const lat1 = Number(origin?.lat);
    const lng1 = Number(origin?.lng);
    const lat2 = Number(destination?.lat);
    const lng2 = Number(destination?.lng);
    if(![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;
    const earthRadiusMiles = 3958.8;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLng = toRadians(lng2 - lng1);
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
    return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  async function lookupLocationPoint(query){
    const raw = String(query || '').trim();
    const q = raw.includes(' - ') ? raw.split(' - ').pop().trim() : raw;
    if(q.length < 2) return null;
    const key = normalizeLocationText(q);
    if(routePointCache.has(key)) return routePointCache.get(key);
    try{
      const r = await fetch(locationSearchUrl(q), { cache: 'no-store' });
      if(!r.ok) return null;
      const data = await r.json().catch(() => ({}));
      const candidate = (data.locations || []).find((loc) => Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng)));
      if(!candidate) return null;
      const point = {
        lat: Number(candidate.lat),
        lng: Number(candidate.lng)
      };
      routePointCache.set(key, point);
      return point;
    }catch{
      return null;
    }
  }

  function hashToUnitInterval(value){
    const text = String(value || 'nexus-route');
    let hash = 0;
    for(let i = 0; i < text.length; i += 1){
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 10000) / 10000;
  }

  function syntheticRoutePoint(stopText, index, total){
    const centerLat = 39.0458;
    const centerLng = -76.6413;
    const spread = 0.24;
    const t = total <= 1 ? 0.5 : index / (total - 1);
    const jitterA = (hashToUnitInterval(`${stopText}|a`) - 0.5) * 0.10;
    const jitterB = (hashToUnitInterval(`${stopText}|b`) - 0.5) * 0.10;
    return {
      lat: centerLat + ((t - 0.5) * spread) + jitterA,
      lng: centerLng + ((t - 0.5) * spread) + jitterB
    };
  }

  async function resolveFallbackRoutePoints(){
    const stops = getRouteStops();
    const normalizedStops = stops.length >= 2 ? stops : [DEFAULT_ROUTE_PICKUP, DEFAULT_ROUTE_DESTINATION];
    const points = await Promise.all(normalizedStops.map((stop, index) => lookupLocationPoint(stop).then((point) => {
      if(point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) return point;
      return syntheticRoutePoint(stop, index, normalizedStops.length);
    })));
    return points;
  }

  async function estimateFallbackRoute(pickupOrStops, destination, waypointStops = []){
    const stops = Array.isArray(pickupOrStops)
      ? pickupOrStops
      : [pickupOrStops, ...(Array.isArray(waypointStops) ? waypointStops : []), destination].filter(Boolean);
    if(stops.length < 2) return null;
    let totalMiles = 0;
    for(let index = 0; index < stops.length - 1; index += 1){
      const [origin, target] = await Promise.all([
        lookupLocationPoint(stops[index]),
        lookupLocationPoint(stops[index + 1])
      ]);
      const straightMiles = haversineMiles(origin, target);
      if(!straightMiles) return null;
      totalMiles += Math.max(1, straightMiles * 1.18);
    }
    return totalMiles;
  }

  function debounce(fn, waitMs){
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  function normalizeService(value){
    const raw = String(value || 'ambulatory').trim().toLowerCase();
    if(raw === 'cct' || raw.includes('critical') || raw.includes('high-acuity') || raw.includes('high acuity') || raw.includes('icu')) return 'facility_transfer_critical';
    if(raw.includes('interfacility') && (raw.includes('als') || raw.includes('critical') || raw.includes('icu') || raw.includes('cct'))) return 'facility_transfer_critical';
    if(raw === 'ift' || raw === 'interfacility') return 'facility_transfer';
    if(raw.includes('facility') && raw.includes('transfer')) return 'facility_transfer';
    return raw;
  }

  function getRequestedServiceFromUrl(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      const keys = ['service', 'transport', 'rideType', 'ride_type', 'type'];
      for(const key of keys){
        const raw = String(params.get(key) || '').trim();
        if(!raw) continue;
        const normalized = normalizeService(raw);
        if(normalized) return normalized;
      }
    }catch{}
    return '';
  }

  function getPricing(service){
    const svc = normalizeService(service);
    const fromCore = platformPricing || window.NexusCore?.getPricing?.() || FALLBACK_PRICING;
    return fromCore[svc] || FALLBACK_PRICING[svc] || FALLBACK_PRICING.ambulatory;
  }

  function getAllPricing(){
    return platformPricing || window.NexusCore?.getPricing?.() || FALLBACK_PRICING;
  }

  function getServicePolicy(service){
    const key = normalizeService(service);
    const policies = fareRules?.servicePolicies || {};
    return policies[key] || {};
  }

  function getNthWeekdayOfMonth(year, monthIndex, weekday, nth){
    const first = new Date(year, monthIndex, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, monthIndex, 1 + offset + ((nth - 1) * 7));
  }

  function getLastWeekdayOfMonth(year, monthIndex, weekday){
    const last = new Date(year, monthIndex + 1, 0);
    const offset = (last.getDay() - weekday + 7) % 7;
    return new Date(year, monthIndex, last.getDate() - offset);
  }

  function sameCalendarDate(a, b){
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function isFederalHoliday(dateInput){
    const d = new Date(dateInput || new Date());
    d.setHours(12, 0, 0, 0);
    const y = d.getFullYear();
    const holidays = [
      new Date(y, 0, 1),
      getNthWeekdayOfMonth(y, 0, 1, 3),
      getNthWeekdayOfMonth(y, 1, 1, 3),
      getLastWeekdayOfMonth(y, 4, 1),
      new Date(y, 5, 19),
      new Date(y, 6, 4),
      getNthWeekdayOfMonth(y, 8, 1, 1),
      getNthWeekdayOfMonth(y, 9, 1, 2),
      new Date(y, 10, 11),
      getNthWeekdayOfMonth(y, 10, 4, 4),
      new Date(y, 11, 25)
    ];
    return holidays.some((h) => sameCalendarDate(h, d));
  }

  function isAfterHoursTime(timeStr){
    const parts = String(timeStr || '00:00').split(':');
    const hour = Number(parts[0]);
    const minute = Number(parts[1] || 0);
    if(!Number.isFinite(hour) || !Number.isFinite(minute)) return true;
    const totalMinutes = (hour * 60) + minute;
    return totalMinutes < (7 * 60) || totalMinutes > (19 * 60);
  }

  function calculateFareBreakdown(service, miles, dateStr, timeStr, routeMetrics = {}){
    const rate = getPricing(service);
    const policy = getServicePolicy(service);
    const distance = Math.max(0, Number(miles) || 0);
    const includedMiles = Number(rate.includedMiles || 0);
    const outboundBillable = Math.max(0, distance - includedMiles);
    const returnThreshold = Math.max(0, Number(fareRules.returnMilesThreshold || 0));
    const returnPct = Math.max(0, Number((policy.returnMilesInclusionPct ?? fareRules.returnMilesInclusionPct) ?? 0)) / 100;
    const returnMiles = distance > returnThreshold ? (distance * returnPct) : 0;
    const totalChargedMiles = distance + returnMiles;
    const billable = outboundBillable + returnMiles;

    let subtotal = Number(rate.base || 0) + billable * Number(rate.perMile || 0);
    subtotal += totalChargedMiles * Number(fareRules.fuelSurchargePerMile || 0);

    const scheduledMinutes = Math.max(0, Number(routeMetrics.durationMinutes || 0));
    const trafficMinutes = Math.max(0, Number(routeMetrics.trafficDurationMinutes || 0));
    const graceMinutes = Math.max(0, Number(fareRules.trafficOverageGraceMinutes || 0));
    const overageMinutes = Math.max(0, trafficMinutes - scheduledMinutes - graceMinutes);
    if(overageMinutes > 0){
      const trafficRate = Math.max(0, Number((policy.trafficOverageFeePerHour ?? fareRules.trafficOverageFeePerHour) ?? 0));
      subtotal += (overageMinutes / 60) * trafficRate;
    }

    const tripDate = new Date(dateStr || new Date());
    const day = tripDate.getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = isFederalHoliday(tripDate);
    const isAfterHours = isAfterHoursTime(timeStr);

    if(isHoliday) subtotal += subtotal * (Number((policy.holidaySurchargePct ?? fareRules.holidaySurchargePct) ?? 0) / 100);
    if(isWeekend) subtotal += subtotal * (Number((policy.weekendSurchargePct ?? fareRules.weekendSurchargePct) ?? 0) / 100);
    if(isAfterHours) subtotal += subtotal * (Number((policy.afterHoursSurchargePct ?? fareRules.afterHoursSurchargePct) ?? 0) / 100);

    const normalizedSubtotal = Math.max(Number(fareRules.minimumFare || 0), subtotal);
    const taxRatePct = Math.max(0, Number(fareRules.taxRatePct || 0));
    const taxAmount = normalizedSubtotal * (taxRatePct / 100);
    return {
      subtotal: normalizedSubtotal,
      taxAmount,
      total: normalizedSubtotal + taxAmount,
      taxRatePct
    };
  }

  function calculateFare(service, miles, dateStr, timeStr, routeMetrics = {}){
    return calculateFareBreakdown(service, miles, dateStr, timeStr, routeMetrics).total;
  }

  async function loadPlatformSettings(){
    try{
      const r = await fetch('/api/settings/public', { cache: 'no-store' });
      if(!r.ok) return;
      const data = await r.json();
      if(data?.pricing && typeof data.pricing === 'object'){
        platformPricing = data.pricing;
      }
      if(data?.fareRules && typeof data.fareRules === 'object'){
        fareRules = { ...DEFAULT_FARE_RULES, ...data.fareRules };
      }
    }catch{}
  }

  async function loadIntegrationConfig(){
    try{
      const r = await fetch('/api/integrations/config', { cache: 'no-store' });
      if(!r.ok) return;
      const cfg = await r.json();
      mapsEnabled = !!cfg.googleMapsEnabled;
      mapsBrowserKey = String(cfg.googleMapsBrowserKey || '').trim();
      stripeEnabled = !!cfg.stripeEnabled;
      squareEnabled = !!cfg.squareEnabled;

      const host = String(window.location.hostname || '').toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1';
      if(isLocalHost){
        // Keep local preview on safe fallback unless live map is explicitly requested.
        const params = new URLSearchParams(window.location.search || '');
        const allowFromQuery = params.get('liveMap') === '1';
        const allowFromStorage = window.localStorage?.getItem('allowLocalGoogleMaps') === '1';
        const allowLocalGoogleMaps = allowFromQuery || allowFromStorage;
        if(allowFromQuery){
          try{ window.localStorage?.setItem('allowLocalGoogleMaps', '1'); }catch{}
        }
        if(!allowLocalGoogleMaps){
          mapsEnabled = false;
          mapsBrowserKey = '';
        }
      }
    }catch{
      mapsEnabled = false;
      stripeEnabled = false;
      squareEnabled = false;
    }
    updatePaymentButtonState();
  }

  function updatePaymentButtonState(){
    if(!payStripeBtn || !paySquareBtn) return;
    const showStripe = stripeEnabled;
    const showSquare = squareEnabled;

    if(showStripe && showSquare){
      payStripeBtn.hidden = false;
      paySquareBtn.hidden = false;
      payStripeBtn.disabled = false;
      paySquareBtn.disabled = false;
      return;
    }

    payStripeBtn.hidden = !showStripe;
    paySquareBtn.hidden = !showSquare;
    payStripeBtn.disabled = !showStripe;
    paySquareBtn.disabled = !showSquare;
  }

  function resolvePaymentProvider(requestedProvider){
    if(requestedProvider === 'stripe' && stripeEnabled) return 'stripe';
    if(requestedProvider === 'square' && squareEnabled) return 'square';
    if(requestedProvider === 'stripe' && squareEnabled) return 'square';
    if(requestedProvider === 'square' && stripeEnabled) return 'stripe';
    if(stripeEnabled) return 'stripe';
    if(squareEnabled) return 'square';
    return null;
  }

  function loadMaps(){
    if(mapsReadyPromise) return mapsReadyPromise;
    mapsReadyPromise = new Promise((resolve, reject) => {
      if(window.google?.maps?.DirectionsService){ resolve(); return; }
      if(!mapsEnabled || !mapsBrowserKey){ reject(new Error('Google Maps is not configured.')); return; }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsBrowserKey)}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load Google Maps.'));
      document.head.appendChild(script);
    });
    return mapsReadyPromise;
  }

  function resetEstimateUi(){
    estimateState = { miles: 0, durationText: '', durationMinutes: 0, trafficDurationMinutes: 0, subtotal: 0, taxAmount: 0, preDiscountFare: 0, memberSavings: 0, fare: 0 };
    estMiles.textContent = '-';
    estDuration.textContent = '-';
    if(estSubtotal) estSubtotal.textContent = '-';
    if(estTax) estTax.textContent = '-';
    if(estMemberSavingsRow) estMemberSavingsRow.hidden = true;
    if(estMemberSavings) estMemberSavings.textContent = '-';
    estFare.textContent = '-';
    if(fareMemberSavingsRow) fareMemberSavingsRow.hidden = true;
    if(fareMemberSavings) fareMemberSavings.textContent = '-';
    if(memberDiscountNote) memberDiscountNote.textContent = `Unlock instant ${MEMBER_DISCOUNT_PCT}% savings on every ride. Sign up now.`;
    clearCustomerRoute();
  }

  function hidePaymentOptions(){
    currentBookingReference = '';
    currentBookingFare = 0;
    bookingSubmitted = false;
    if(paymentSection) paymentSection.hidden = true;
    setPaymentMessage('');
    if(submitBtn){
      submitBtn.textContent = 'Book My Ride';
      submitBtn.hidden = false;
    }
  }

  function showPaymentOptions(reference, fare, requiresOnlinePayment = true){
    currentBookingReference = String(reference || '').trim();
    currentBookingFare = Number(fare || 0);
    if(!paymentSection || !currentBookingReference) return;
    // Staff-created bookings are invoiced; no online payment section shown
    if(!requiresOnlinePayment){
      paymentSection.hidden = true;
      return;
    }
    paymentSection.hidden = false;
    const depositAmt = Math.round(currentBookingFare * 0.25 * 100) / 100;
    const taxRatePct = Math.max(0, Number(fareRules.taxRatePct || 0));
    const discountText = estimateState.memberSavings > 0
      ? ` Includes member savings of $${estimateState.memberSavings.toFixed(2)}.`
      : ` Guest fare shown. Create a rider account to save ${MEMBER_DISCOUNT_PCT}% every ride.`;
    if(taxRatePct > 0){
      const inferredSubtotal = currentBookingFare / (1 + (taxRatePct / 100));
      const inferredTax = Math.max(0, currentBookingFare - inferredSubtotal);
      paymentSummary.textContent = `Booking ${currentBookingReference} is ready for payment. Estimated total: $${currentBookingFare.toFixed(2)} (subtotal $${inferredSubtotal.toFixed(2)} + tax $${inferredTax.toFixed(2)} at ${taxRatePct.toFixed(2)}%).${discountText}`;
    }else{
      paymentSummary.textContent = `Booking ${currentBookingReference} is ready for payment. Estimated total: $${currentBookingFare.toFixed(2)}.${discountText}`;
    }
    // Populate deposit / full labels
    if(depositAmountLabel) depositAmountLabel.textContent = `$${depositAmt.toFixed(2)}`;
    if(fullAmountLabel) fullAmountLabel.textContent = `$${currentBookingFare.toFixed(2)}`;
    // Show deposit/full buttons; hide legacy single-provider buttons
    if(payDepositBtn) payDepositBtn.hidden = false;
    if(payFullBtn) payFullBtn.hidden = false;
    if(payStripeBtn) payStripeBtn.hidden = true;
    if(paySquareBtn) paySquareBtn.hidden = true;
    updatePaymentButtonState();
    if(stripeEnabled && squareEnabled){
      setPaymentMessage('Choose a payment method to reserve your ride.');
    }else if(squareEnabled || stripeEnabled){
      setPaymentMessage('Reserve your ride with a deposit or pay in full now.');
    }else{
      setPaymentMessage('Payment checkout is currently unavailable. Dispatch will contact you.', true);
      if(payDepositBtn) payDepositBtn.disabled = true;
      if(payFullBtn) payFullBtn.disabled = true;
    }
  }

  async function startHostedPayment(provider, paymentMode){
    if(!currentBookingReference){
      setPaymentMessage('Create a booking before starting payment.', true);
      return;
    }
    const resolvedProvider = resolvePaymentProvider(provider);
    if(!resolvedProvider){
      setPaymentMessage('Payment checkout is unavailable because no provider is configured.', true);
      return;
    }
    const mode = ['deposit','full'].includes(paymentMode) ? paymentMode : 'full';
    const button = mode === 'deposit' ? payDepositBtn : payFullBtn;
    const idleText = mode === 'deposit'
      ? `Pay 25% Deposit — $${(Math.round(currentBookingFare * 0.25 * 100) / 100).toFixed(2)}`
      : `Pay in Full — $${currentBookingFare.toFixed(2)}`;
    const busyText = mode === 'deposit' ? 'Opening deposit checkout...' : 'Opening full payment checkout...';
    setBusy(button, true, busyText, idleText);
    const fallbackNotice = resolvedProvider !== provider ? ` (using ${resolvedProvider === 'stripe' ? 'Stripe' : 'Square'})` : '';
    setPaymentMessage(`Preparing ${mode === 'deposit' ? 'deposit' : 'full payment'} checkout${fallbackNotice}...`);
    try{
      const r = await fetch(`/api/payments/${resolvedProvider}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingReference: currentBookingReference, amount: currentBookingFare, paymentMode: mode })
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || `Failed to start ${resolvedProvider} checkout`);
      if(!data.url) throw new Error(`${resolvedProvider} checkout URL was not returned`);
      window.location.href = data.url;
    }catch(err){
      setPaymentMessage(err.message, true);
      setBusy(button, false, busyText, idleText);
      return;
    }
  }

  function clearCustomerRoute(){
    if(customerRoutePolyline) customerRoutePolyline.setMap(null);
    if(customerPickupMarker) customerPickupMarker.setMap(null);
    if(customerDestinationMarker) customerDestinationMarker.setMap(null);
    customerRoutePolyline = null;
    customerPickupMarker = null;
    customerDestinationMarker = null;
    customerRouteBounds = null;
    applyFocusMode();
  }

  window.NexusBookingApp = {
    showPaymentOptions,
    startHostedPayment
  };

  function renderTelemetryFallback(vehicles = [], usingLocalMock = false, routePoints = []){
    if(!telemetryMapEl) return;
    const points = vehicles.filter((v) => Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lng))).slice(0, 24);
    const pathPoints = routePoints.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
    const defaultBounds = { minLat: 38.85, maxLat: 39.25, minLng: -76.95, maxLng: -76.35 };
    const boundsSource = [...points.map((v) => ({ lat: Number(v.lat), lng: Number(v.lng) })), ...pathPoints];
    const bounds = boundsSource.length
      ? boundsSource.reduce((acc, p) => ({
          minLat: Math.min(acc.minLat, Number(p.lat)),
          maxLat: Math.max(acc.maxLat, Number(p.lat)),
          minLng: Math.min(acc.minLng, Number(p.lng)),
          maxLng: Math.max(acc.maxLng, Number(p.lng))
        }), { ...defaultBounds })
      : defaultBounds;

    const latSpan = Math.max(0.04, bounds.maxLat - bounds.minLat);
    const lngSpan = Math.max(0.04, bounds.maxLng - bounds.minLng);
    const project = (lat, lng) => {
      const x = ((Number(lng) - bounds.minLng) / lngSpan) * 100;
      const y = 100 - (((Number(lat) - bounds.minLat) / latSpan) * 100);
      return { x: Math.max(4, Math.min(96, x)), y: Math.max(6, Math.min(94, y)) };
    };

    const routeLineSource = pathPoints.length >= 2 ? pathPoints : points.slice(0, 10).map((v) => ({ lat: v.lat, lng: v.lng }));
    const routeLine = routeLineSource.map((pnt) => {
      const p = project(pnt.lat, pnt.lng);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(' ');

    const roadSeed = points.length ? points : [{ lat: bounds.minLat, lng: bounds.minLng }];
    const roads = roadSeed.slice(0, 8).map((_, idx) => {
      const y = 8 + (idx * 11.5);
      const bend = idx % 2 === 0 ? 7 : -7;
      return `<path d="M -4 ${y.toFixed(2)} Q 34 ${(y + bend).toFixed(2)} 104 ${y.toFixed(2)}" stroke="rgba(255,255,255,.42)" stroke-width="1.2" fill="none"/>`;
    }).join('');

    const laneMarks = roadSeed.slice(0, 6).map((_, idx) => {
      const x = 12 + (idx * 15);
      return `<path d="M ${x.toFixed(2)} -6 Q ${(x + 4).toFixed(2)} 45 ${x.toFixed(2)} 106" stroke="rgba(89,124,149,.2)" stroke-width=".8" fill="none" stroke-dasharray="2 2"/>`;
    }).join('');

    const vehicleDots = points.map((vehicle) => {
      const p = project(vehicle.lat, vehicle.lng);
      return `
        <g>
          <circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.7" fill="rgba(10,107,153,.16)">
            <animate attributeName="r" values="2.2;4.2;2.2" dur="2.4s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" repeatCount="indefinite"/>
          </circle>
          <circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.8" fill="#0a6b99" stroke="#ffffff" stroke-width="0.65"><title>${String(vehicle.unit || vehicle.id || 'Vehicle')} - ${String(vehicle.status || 'ACTIVE')}</title></circle>
        </g>
      `;
    }).join('');

    const startPoint = routeLineSource[0];
    const endPoint = routeLineSource[routeLineSource.length - 1];
    const projectedStart = startPoint ? project(startPoint.lat, startPoint.lng) : null;
    const projectedEnd = endPoint ? project(endPoint.lat, endPoint.lng) : null;
    const routeMarkers = `${projectedStart ? `<circle cx="${projectedStart.x.toFixed(2)}" cy="${projectedStart.y.toFixed(2)}" r="2.2" fill="#0b7a5a" stroke="#ffffff" stroke-width="0.8"/>` : ''}${projectedEnd ? `<circle cx="${projectedEnd.x.toFixed(2)}" cy="${projectedEnd.y.toFixed(2)}" r="2.2" fill="#d61f1f" stroke="#ffffff" stroke-width="0.8"/>` : ''}`;
    const distanceText = String(estMiles?.textContent || '-').trim() || '-';
    const etaText = String(estDuration?.textContent || '-').trim() || '-';
    const fareText = String(estFare?.textContent || '-').trim() || '-';
    const tripTitle = destinationConfirmed ? 'Route confirmed' : 'Route preview';

    telemetryMapEl.innerHTML = `
      <div class="telemetryFallbackMap" aria-label="Live telemetry map fallback">
        <div class="telemetryFallbackOverlay">
          <span class="telemetryFallbackBadge">${usingLocalMock ? 'Live (demo map)' : 'Live telemetry map'}</span>
          <span class="telemetryFallbackBadge">${points.length} nearby units</span>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Fleet map view">
          <defs>
            <pattern id="telemetryGrid" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(27,62,83,.12)" stroke-width="0.5"/>
            </pattern>
            <linearGradient id="routeGlow" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stop-color="#0b7a5a"/>
              <stop offset="100%" stop-color="#d61f1f"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#telemetryGrid)"/>
          ${roads}
          ${laneMarks}
          ${routeLine ? `<polyline points="${routeLine}" fill="none" stroke="url(#routeGlow)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
          ${routeMarkers}
          ${vehicleDots}
        </svg>
        <div class="telemetryFallbackBottom">
          <div class="telemetryFallbackTripTitle">${tripTitle}</div>
          <div class="telemetryFallbackStats">
            <div class="telemetryFallbackStat"><b>Distance</b><span>${distanceText}</span></div>
            <div class="telemetryFallbackStat"><b>ETA</b><span>${etaText}</span></div>
            <div class="telemetryFallbackStat"><b>Fare</b><span>${fareText}</span></div>
          </div>
        </div>
      </div>
    `;
    if(telemetryList){
      telemetryList.innerHTML = '';
      telemetryList.hidden = true;
    }
    if(telemetryStatus){
      telemetryStatus.hidden = false;
      telemetryStatus.textContent = `${usingLocalMock ? 'Live (local demo)' : 'Live'}: ${vehicles.length} vehicles • updated ${new Date().toLocaleTimeString()}`;
    }
    updateTelemetrySpotlight();
  }

  function buildRouteBounds(result){
    if(result?.routes?.[0]?.bounds) return result.routes[0].bounds;
    const bounds = new google.maps.LatLngBounds();
    (result?.routes?.[0]?.overview_path || []).forEach((pt) => bounds.extend(pt));
    return bounds;
  }

  function applyFocusMode(){
    const focused = !!(focusMyRouteOnly?.checked && customerRouteBounds);
    telemetryMarkers.forEach((marker) => marker.setOpacity(focused ? 0.2 : 0.95));
    if(telemetryList) telemetryList.classList.toggle('dimmed', focused);
    if(customerRoutePolyline){
      customerRoutePolyline.setOptions({
        strokeOpacity: focused ? 1 : 0.9,
        strokeWeight: focused ? 7 : 5
      });
    }
  }

  function fitCombinedViewport(vehicles = []){
    if(!telemetryMap) return;
    const focused = !!(focusMyRouteOnly?.checked && customerRouteBounds);
    if(focused && customerRouteBounds){
      telemetryMap.fitBounds(customerRouteBounds, 56);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;
    if(customerRouteBounds){
      bounds.extend(customerRouteBounds.getNorthEast());
      bounds.extend(customerRouteBounds.getSouthWest());
      hasBounds = true;
    }
    vehicles.slice(0, 25).forEach((v) => {
      bounds.extend({ lat:Number(v.lat), lng:Number(v.lng) });
      hasBounds = true;
    });
    if(hasBounds) telemetryMap.fitBounds(bounds, 48);
  }

  function renderCustomerRoute(result, pickupLabel, destinationLabel){
    if(!telemetryMap || !result?.routes?.[0]) return;
    if(customerRoutePolyline) customerRoutePolyline.setMap(null);
    if(customerPickupMarker) customerPickupMarker.setMap(null);
    if(customerDestinationMarker) customerDestinationMarker.setMap(null);

    customerRoutePolyline = new google.maps.Polyline({
      map: telemetryMap,
      path: result.routes[0].overview_path || [],
      geodesic: true,
      strokeColor: '#0b7a5a',
      strokeOpacity: 0.9,
      strokeWeight: 5,
      zIndex: 500
    });

    const legs = result.routes[0].legs || [];
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1] || firstLeg;
    const start = firstLeg?.start_location;
    const end = lastLeg?.end_location;
    if(start){
      customerPickupMarker = new google.maps.Marker({
        map: telemetryMap,
        position: start,
        title: `Pickup: ${pickupLabel}`,
        label: { text: 'P', color: '#ffffff', fontWeight: '700' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#0b7a5a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 9
        },
        zIndex: 700
      });
    }
    if(end){
      customerDestinationMarker = new google.maps.Marker({
        map: telemetryMap,
        position: end,
        title: `Destination: ${destinationLabel}`,
        label: { text: 'D', color: '#ffffff', fontWeight: '700' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#0c4a6e',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 9
        },
        zIndex: 700
      });
    }

    customerRouteBounds = buildRouteBounds(result);
    applyFocusMode();
    fitCombinedViewport();
  }

  function renderRateEditor(service){
    const taxRatePct = Math.max(0, Number(fareRules.taxRatePct || 0));
    const taxHint = taxRatePct > 0 ? ` Tax ${taxRatePct.toFixed(2)}% is added on top.` : ' Tax is not applied.';
    if(!isAdminUser){
      rateBase.value = '';
      rateIncluded.value = '';
      ratePerMile.value = '';
      rateWait.value = '';
      rateSourceLabel.textContent = `Fare estimate is calculated automatically.${taxHint}`;
      return;
    }
    const svc = normalizeService(service);
    const r = getPricing(svc);
    rateBase.value = Number(r.base || 0);
    rateIncluded.value = Number(r.includedMiles || 0);
    ratePerMile.value = Number(r.perMile || 0);
    rateWait.value = Number(r.waitPer15 || 0);
    const label = r.label || svc.toUpperCase();
    rateSourceLabel.textContent = `Using ${label}: base $${Number(r.base||0).toFixed(2)}, ${Number(r.includedMiles||0)} included miles, $${Number(r.perMile||0).toFixed(2)}/mile.${taxHint}`;
  }

  function saveCurrentServiceRate(){
    if(!isAdminUser){
      setStatus('Only Admin users can update service rates.', 'err');
      return;
    }
    const svc = normalizeService($('service').value);
    const pricing = { ...getAllPricing() };
    const current = pricing[svc] || FALLBACK_PRICING[svc] || FALLBACK_PRICING.ambulatory;
    pricing[svc] = {
      ...current,
      base: Math.max(0, Number(rateBase.value || 0)),
      includedMiles: Math.max(0, Number(rateIncluded.value || 0)),
      perMile: Math.max(0, Number(ratePerMile.value || 0)),
      waitPer15: Math.max(0, Number(rateWait.value || 0))
    };
    const token = sessionStorage.getItem('nexusAccessToken');
    fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token || ''}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ pricing })
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Failed to save pricing');
      platformPricing = data.settings?.pricing || pricing;
      renderRateEditor(svc);
      if(estimateState.miles > 0){
        const breakdown = calculateFareBreakdown(svc, estimateState.miles, $('tripDate').value, $('tripTime').value);
        estimateState.subtotal = breakdown.subtotal;
        estimateState.taxAmount = breakdown.taxAmount;
        estimateState.fare = breakdown.total;
        if(estSubtotal) estSubtotal.textContent = `$${breakdown.subtotal.toFixed(2)}`;
        if(estTax) estTax.textContent = `$${breakdown.taxAmount.toFixed(2)}${breakdown.taxRatePct > 0 ? ` (${breakdown.taxRatePct.toFixed(2)}%)` : ''}`;
        estFare.textContent = `$${breakdown.total.toFixed(2)}`;
      }
      setStatus('Rate updated for selected service.', 'ok');
    }).catch((err) => {
      setStatus(err.message, 'err');
    });
  }

  function resetCurrentServiceRate(){
    if(!isAdminUser){
      setStatus('Only Admin users can reset service rates.', 'err');
      return;
    }
    const svc = normalizeService($('service').value);
    const pricing = { ...getAllPricing(), [svc]: { ...FALLBACK_PRICING[svc] } };
    const token = sessionStorage.getItem('nexusAccessToken');
    fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token || ''}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ pricing })
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Failed to reset pricing');
      platformPricing = data.settings?.pricing || pricing;
      renderRateEditor(svc);
      if(estimateState.miles > 0){
        const breakdown = calculateFareBreakdown(svc, estimateState.miles, $('tripDate').value, $('tripTime').value);
        estimateState.subtotal = breakdown.subtotal;
        estimateState.taxAmount = breakdown.taxAmount;
        estimateState.fare = breakdown.total;
        if(estSubtotal) estSubtotal.textContent = `$${breakdown.subtotal.toFixed(2)}`;
        if(estTax) estTax.textContent = `$${breakdown.taxAmount.toFixed(2)}${breakdown.taxRatePct > 0 ? ` (${breakdown.taxRatePct.toFixed(2)}%)` : ''}`;
        estFare.textContent = `$${breakdown.total.toFixed(2)}`;
      }
      setStatus('Rate reset to default for selected service.', 'ok');
    }).catch((err) => {
      setStatus(err.message, 'err');
    });
  }

  function wireGoogleAutocomplete(){
    try{
      if(!window.google?.maps?.places?.Autocomplete) return false;
      if(!pickupAutocomplete){
        pickupAutocomplete = new google.maps.places.Autocomplete($('pickup'), { types:['geocode'] });
        pickupAutocomplete.addListener('place_changed', () => {
          const place = pickupAutocomplete.getPlace();
          if(place?.formatted_address) $('pickup').value = place.formatted_address;
          resetEstimateUi();
        });
      }
      if(!destinationAutocomplete){
        destinationAutocomplete = new google.maps.places.Autocomplete($('destination'), { types:['geocode'] });
        destinationAutocomplete.addListener('place_changed', () => {
          const place = destinationAutocomplete.getPlace();
          if(place?.formatted_address) $('destination').value = place.formatted_address;
          resetEstimateUi();
        });
      }
      return true;
    }catch{
      return false;
    }
  }

  async function fetchLocationSuggestions(query, signal){
    const q = String(query || '').trim();
    if(q.length < 2) return [];
    if(/^\d{1,3}$/.test(q)) return [];
    const key = q.toLowerCase();
    if(locationSuggestionCache.has(key)) return locationSuggestionCache.get(key);

    let bestPrefix = '';
    let bestSuggestions = null;
    for(const [cachedKey, cachedSuggestions] of locationSuggestionCache.entries()){
      if(key.startsWith(cachedKey) && cachedSuggestions.length && cachedKey.length > bestPrefix.length){
        bestPrefix = cachedKey;
        bestSuggestions = cachedSuggestions;
      }
    }
    if(bestSuggestions){
      const filtered = filterSuggestionsForQuery(bestSuggestions, key);
      if(filtered.length){
        locationSuggestionCache.set(key, filtered);
        return filtered;
      }
    }

    try{
      const r = await fetch(locationSearchUrl(q), { cache: 'no-store', signal });
      if(!r.ok) return [];
      const data = await r.json();
      const suggestions = (data.locations || []).map((loc) => {
        const name = String(loc.name || '').trim();
        const address = String(loc.address || '').trim();
        if(String(loc.type || '').toLowerCase() === 'geocode') return address || name;
        return address ? `${name} - ${address}` : name;
      }).filter(Boolean).slice(0, 8);
      if(!suggestions.length){
        const fallback = getDefaultMarylandSuggestions(q);
        locationSuggestionCache.set(key, fallback);
        return fallback;
      }
      locationSuggestionCache.set(key, suggestions);
      return suggestions;
    }catch{
      return getDefaultMarylandSuggestions(q);
    }
  }

  function hideSuggestionPanel(panel){
    if(panel) panel.hidden = true;
  }

  function renderSuggestionPanel(panel, suggestions, onPick){
    if(!panel) return;
    if(!suggestions.length){
      panel.innerHTML = '';
      panel.hidden = true;
      return;
    }
    panel.innerHTML = suggestions.map((value) => `<button type="button" class="suggestionButton" data-suggestion="${value.replace(/"/g, '&quot;')}">${value}</button>`).join('');
    panel.hidden = false;
    panel.querySelectorAll('[data-suggestion]').forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => onPick(button.getAttribute('data-suggestion') || ''));
    });
  }

  function bindSuggestionAutocompleteToElements(input, panel, routeField = ''){
    if(!input || !panel) return;
    let requestId = 0;
    let controller = null;
    let lastLookupValue = '';
    const update = debounce(async () => {
      const value = String(input.value || '').trim();
      if(value.length < 2){
        hideSuggestionPanel(panel);
        lastLookupValue = '';
        return;
      }
      if(value === lastLookupValue) return;
      lastLookupValue = value;
      const nextRequestId = ++requestId;
      if(controller) controller.abort();
      controller = new AbortController();
      const suggestions = await fetchLocationSuggestions(value, controller.signal);
      if(nextRequestId !== requestId) return;
      renderSuggestionPanel(panel, suggestions, (selected) => {
        input.value = selected;
        hideSuggestionPanel(panel);
        if(routeField === 'pickup' || String(routeField || '').startsWith('destination')){
          markDestinationUnconfirmed();
          updateTelemetryRouteHint();
        }
        autoEstimate();
        syncSectionProgressUi();
      });
    }, 120);
    input.addEventListener('input', () => {
      if(routeField === 'pickup' || String(routeField || '').startsWith('destination')){
        markDestinationUnconfirmed();
        updateTelemetryRouteHint();
      }
      update();
      syncSectionProgressUi();
    });
    input.addEventListener('change', () => {
      requestId += 1;
      if(controller) controller.abort();
      hideSuggestionPanel(panel);
      if(routeField === 'pickup' || String(routeField || '').startsWith('destination')){
        markDestinationUnconfirmed();
        updateTelemetryRouteHint();
      }
      autoEstimate();
      syncSectionProgressUi();
    });
    input.addEventListener('keydown', (event) => {
      if(event.key === 'Enter' || event.key === 'Tab'){
        requestId += 1;
        if(controller) controller.abort();
        hideSuggestionPanel(panel);
      }
    });
    input.addEventListener('blur', () => {
      window.setTimeout(() => hideSuggestionPanel(panel), 120);
      if(routeField === 'pickup' || String(routeField || '').startsWith('destination')) syncSectionProgressUi();
    });
    input.addEventListener('focus', async () => {
      const value = String(input.value || '').trim();
      if(value.length) return;
      const seededSuggestions = getDefaultMarylandSuggestions('Maryland');
      renderSuggestionPanel(panel, seededSuggestions, (selected) => {
        input.value = selected;
        hideSuggestionPanel(panel);
        if(routeField === 'pickup' || String(routeField || '').startsWith('destination')){
          markDestinationUnconfirmed();
          updateTelemetryRouteHint();
        }
        autoEstimate();
        syncSectionProgressUi();
      });
      requestId += 1;
      const nextRequestId = requestId;
      if(controller) controller.abort();
      controller = new AbortController();
      const suggestions = await fetchLocationSuggestions('Maryland', controller.signal);
      if(nextRequestId !== requestId) return;
      renderSuggestionPanel(panel, suggestions, (selected) => {
        input.value = selected;
        hideSuggestionPanel(panel);
        if(routeField === 'pickup' || routeField === 'destination'){
          markDestinationUnconfirmed();
          updateTelemetryRouteHint();
        }
        autoEstimate();
        syncSectionProgressUi();
      });
    });
  }

  function bindSuggestionAutocomplete(inputId, panelId){
    bindSuggestionAutocompleteToElements($(inputId), $(panelId), inputId);
  }

  async function initAddressAutocomplete(){
    bindSuggestionAutocomplete('pickup', 'pickupSuggestionsPanel');
    bindSuggestionAutocomplete('destination', 'destinationSuggestionsPanel');
    if(mapsEnabled && mapsBrowserKey){
      try{
        await loadMaps();
        wireGoogleAutocomplete();
      }catch{}
    }
  }

  async function estimateRouteAndFare(){
    clearStatus();

    const pickup = $('pickup').value.trim();
    const destinations = getRouteDestinations();
    const destination = destinations[destinations.length - 1] || '';
    const service = normalizeService($('service').value);
    const tripDate = $('tripDate').value;

    if(!pickup || !destination){
      markDestinationUnconfirmed();
      const breakdown = calculateFareBreakdown(service, 0, tripDate, $('tripTime').value, { durationMinutes: 0, trafficDurationMinutes: 0 });
      renderFareEstimateBreakdown(breakdown, 0, '-', 0, 0);
      setStatus('Enter pickup and destination stops to estimate route miles.', 'err');
      syncSectionProgressUi();
      return estimateState;
    }

    let miles = 0;
    let durationText = '';
    let durationMinutes = 0;
    let trafficDurationMinutes = 0;

    try{
      await loadMaps();
      const dirSvc = new google.maps.DirectionsService();
      const waypoints = destinations.slice(0, -1).map((location) => ({ location, stopover: true }));
      const result = await new Promise((resolve, reject) => {
        dirSvc.route({
          origin: pickup,
          destination,
          waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
          drivingOptions: {
            departureTime: new Date(),
            trafficModel: google.maps.TrafficModel.BEST_GUESS
          },
          unitSystem: google.maps.UnitSystem.IMPERIAL
        }, (res, status) => status === 'OK' ? resolve(res) : reject(new Error(status)));
      });
      const legs = result.routes?.[0]?.legs || [];
      miles = legs.reduce((sum, leg) => sum + (Number(leg?.distance?.value || 0) / 1609.34), 0);
      durationMinutes = legs.reduce((sum, leg) => sum + (Number(leg?.duration?.value || 0) / 60), 0);
      trafficDurationMinutes = legs.reduce((sum, leg) => sum + (Number(leg?.duration_in_traffic?.value || leg?.duration?.value || 0) / 60), 0);
      durationText = String(legs.map((leg) => String(leg?.duration?.text || '').trim()).filter(Boolean).join(' + '));
      const trafficText = String(legs.map((leg) => String(leg?.duration_in_traffic?.text || '').trim()).filter(Boolean).join(' + '));
      if(trafficText && trafficDurationMinutes > durationMinutes){
        durationText = `${durationText} (traffic ${trafficText})`;
      }
      renderCustomerRoute(result, pickup, destination);
    }catch(err){
      const fallbackMiles = await estimateFallbackRoute([pickup, ...destinations]);
      if(fallbackMiles){
        const fallbackBreakdown = calculateFareBreakdown(service, fallbackMiles, tripDate, $('tripTime').value, { durationMinutes: 0, trafficDurationMinutes: 0 });
        renderFareEstimateBreakdown(fallbackBreakdown, fallbackMiles, 'Estimated locally', 0, 0);
        setStatus('Route estimated locally because Google Maps is unavailable.', 'ok');
        syncSectionProgressUi();
        return estimateState;
      }
      markDestinationUnconfirmed();
      const fallbackBreakdown = calculateFareBreakdown(service, 0, tripDate, $('tripTime').value, { durationMinutes: 0, trafficDurationMinutes: 0 });
      renderFareEstimateBreakdown(fallbackBreakdown, 0, '-', 0, 0);
      setStatus(`Route estimate unavailable (${err.message}). You can still submit booking.`, 'err');
      syncSectionProgressUi();
      return estimateState;
    }

    const breakdown = calculateFareBreakdown(service, miles, tripDate, $('tripTime').value, { durationMinutes, trafficDurationMinutes });
    renderFareEstimateBreakdown(breakdown, miles, durationText || '-', durationMinutes, trafficDurationMinutes);
    setStatus('Route and fare estimate updated.', 'ok');
    syncSectionProgressUi();
    return estimateState;
  }

  function bindCoreActions(){
    if(coreActionsBound || !form) return;
    if(estimateBtn){
      estimateBtn.addEventListener('click', async() => {
        setBusy(estimateBtn, true, 'Estimating...', 'Estimate Fare');
        try{ await estimateRouteAndFare(); }
        finally{ setBusy(estimateBtn, false, 'Estimating...', 'Estimate Fare'); }
      });
    }
    form.addEventListener('submit', submitBooking);
    coreActionsBound = true;
  }

  function bindAuthActions(){
    if(authActionsBound) return;
    const toggleSignupPanel = () => {
      if(!signUpPanel) return;
      const opening = signUpPanel.hidden;
      signUpPanel.hidden = !opening;
      if(signUpBtn) signUpBtn.textContent = opening ? 'Hide Sign Up' : SIGNUP_CTA_LABEL;
      if(opening) renderSignupPasswordStrength();
      if(opening){
        if(signupName && !signupName.value) signupName.value = String($('name')?.value || '').trim();
        if(signupPhone && !signupPhone.value) signupPhone.value = formatPhone(String($('phone')?.value || '').trim());
        if(signupEmail && !signupEmail.value) signupEmail.value = String(loginEmail?.value || '').trim();
      }
    };
    if(authActionBtn) authActionBtn.addEventListener('click', handleAuthAction);
    if(loginPassword) loginPassword.addEventListener('keydown', (event) => {
      if(event.key === 'Enter'){
        event.preventDefault();
        loginFromBookingApp();
      }
    });
    if(showPasswordToggle && loginPassword){
      showPasswordToggle.addEventListener('change', () => {
        loginPassword.type = showPasswordToggle.checked ? 'text' : 'password';
      });
    }
    if(forgotPasswordBtn){
      forgotPasswordBtn.onclick = () => {
        if(!forgotPasswordPanel) return;
        const opening = forgotPasswordPanel.hidden;
        forgotPasswordPanel.hidden = !opening;
        if(opening){
          if(forgotPasswordEmail && !forgotPasswordEmail.value) forgotPasswordEmail.value = String(loginEmail?.value || '').trim();
          setForgotPasswordMessage('Enter the email on your rider or staff account and we will send a secure reset link if the account exists.');
        }
      };
    }
    if(forgotPasswordEmail){
      forgotPasswordEmail.addEventListener('keydown', (event) => {
        if(event.key === 'Enter'){
          event.preventDefault();
          requestPasswordReset();
        }
      });
    }
    if(sendResetPasswordBtn) sendResetPasswordBtn.onclick = requestPasswordReset;
    if(signupPassword) signupPassword.addEventListener('input', renderSignupPasswordStrength);
    if(signupEmail) signupEmail.addEventListener('input', renderSignupPasswordChecklist);
    if(signupName) signupName.addEventListener('input', renderSignupPasswordChecklist);
    if(signUpBtn){
      signUpBtn.onclick = toggleSignupPanel;
    }
    if(createAccountBtn){
      createAccountBtn.onclick = signupFromBookingApp;
    }
    renderSignupPasswordStrength();
    renderSignupPasswordChecklist();
    authActionsBound = true;
  }

  function bindManageTripActions(defaultDate, defaultTime){
    if(manageActionsBound) return;
    if(toggleManageTripBtn && manageTripPanel){
      toggleManageTripBtn.addEventListener('click', () => {
        const opening = manageTripPanel.hidden;
        manageTripPanel.hidden = !opening;
        toggleManageTripBtn.textContent = opening ? 'Hide trip manager' : 'Manage an existing trip';
        if(!opening){
          clearManagedTripView();
          setManageTripMessage('');
        }
      });
    }
    if(managePhone){
      managePhone.addEventListener('blur', () => {
        const formatted = formatPhone(managePhone.value);
        if(formatted && formatted !== managePhone.value) managePhone.value = formatted;
      });
    }
    if(manageLookupBtn){
      manageLookupBtn.addEventListener('click', lookupManagedTrip);
      manageLookupBtn.onclick = lookupManagedTrip;
    }
    if(manageRescheduleBtn){
      manageRescheduleBtn.addEventListener('click', rescheduleManagedTrip);
      manageRescheduleBtn.onclick = rescheduleManagedTrip;
    }
    if(manageCancelBtn){
      manageCancelBtn.addEventListener('click', cancelManagedTrip);
      manageCancelBtn.onclick = cancelManagedTrip;
    }
    if(manageDate && defaultDate) manageDate.value = defaultDate;
    if(manageDate && defaultDate) manageDate.min = defaultDate;
    if(manageTime && defaultTime) manageTime.value = defaultTime;
    manageActionsBound = true;
  }

  window.nexusEstimateFare = async () => {
    if(estimateBtn) setBusy(estimateBtn, true, 'Estimating...', 'Estimate Fare');
    try{
      return await estimateRouteAndFare();
    }finally{
      if(estimateBtn) setBusy(estimateBtn, false, 'Estimating...', 'Estimate Fare');
    }
  };

  function formatPhone(raw){
    const digits = String(raw || '').replace(/\D/g, '');
    const localDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if(localDigits.length !== 10) return raw;
    return `(${localDigits.slice(0,3)}) ${localDigits.slice(3,6)}-${localDigits.slice(6)}`;
  }

  function formatPhoneField(){
    const phoneInput = $('phone');
    if(!phoneInput) return;
    const formatted = formatPhone(phoneInput.value);
    if(formatted && formatted !== phoneInput.value) phoneInput.value = formatted;
  }

  function selectService(service){
    const clean = normalizeService(service);
    const allowed = allowedServicesForRole(currentUserRole);
    if(!allowed.has(clean)){
      const fallback = Array.from(allowed)[0] || 'ambulatory';
      $('service').value = fallback;
      setLoginMessage('This role cannot book that ride type.', true);
      return selectService(fallback);
    }
    $('service').value = clean;
    expandedSections.delete('rideTypeSection');
    serviceChips.querySelectorAll('.chip').forEach((chip) => {
      const active = chip.dataset.service === clean;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    if(estimateState.miles > 0){
      const breakdown = calculateFareBreakdown(clean, estimateState.miles, $('tripDate').value, $('tripTime').value, { durationMinutes: estimateState.durationMinutes, trafficDurationMinutes: estimateState.trafficDurationMinutes });
      renderFareEstimateBreakdown(
        breakdown,
        estimateState.miles,
        estimateState.durationText || '-',
        estimateState.durationMinutes,
        estimateState.trafficDurationMinutes
      );
    }
    renderRateEditor(clean);
    autoEstimate();
    syncSectionProgressUi();
  }

  function bindServiceChips(){
    serviceChips.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => selectService(chip.dataset.service));
    });
  }

  function telemetryIcon(){
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#0a6b99',
      fillOpacity: 0.9,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 7
    };
  }

  async function loadTelemetry(){
    try{
      const r = await fetch('/api/fleet/live', { cache: 'no-store' });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      let vehicles = (data.vehicles || []).filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lng));
      let usingLocalMock = false;
      if(!vehicles.length && isLocalHost()){
        vehicles = localMockVehicles();
        usingLocalMock = true;
      }
      lastTelemetryVehicles = vehicles.slice();
      lastTelemetryUsingLocalMock = usingLocalMock;
      updateTelemetrySpotlight();

      if(!telemetryMap){
        const routePoints = await resolveFallbackRoutePoints();
        renderTelemetryFallback(vehicles, usingLocalMock, routePoints);
        return;
      }
      if(telemetryStatus){
        telemetryStatus.hidden = false;
        telemetryStatus.textContent = `${usingLocalMock ? 'Live (local demo)' : 'Live'}: ${vehicles.length} vehicles • updated ${new Date(data.generatedAt || Date.now()).toLocaleTimeString()}`;
      }
      if(telemetryList) telemetryList.innerHTML = '';
      const activeIds = new Set();
      vehicles.forEach(v => {
        const id = String(v.id || v.unit);
        activeIds.add(id);
        let marker = telemetryMarkers.get(id);
        const position = { lat: Number(v.lat), lng: Number(v.lng) };
        if(!marker){
          marker = new google.maps.Marker({
            map: telemetryMap,
            position,
            title: `${v.unit || v.id} (${v.status || 'ACTIVE'})`,
            icon: telemetryIcon()
          });
          telemetryMarkers.set(id, marker);
        }else{
          marker.setPosition(position);
          marker.setTitle(`${v.unit || v.id} (${v.status || 'ACTIVE'})`);
        }
      });

      telemetryMarkers.forEach((marker, id) => {
        if(!activeIds.has(id)){
          marker.setMap(null);
          telemetryMarkers.delete(id);
        }
      });
      applyFocusMode();
      fitCombinedViewport(vehicles);
    }catch(err){
      if(isLocalHost()){
        const vehicles = localMockVehicles();
        lastTelemetryVehicles = vehicles.slice();
        lastTelemetryUsingLocalMock = true;
        updateTelemetrySpotlight();
        const routePoints = await resolveFallbackRoutePoints();
        renderTelemetryFallback(vehicles, true, routePoints);
        return;
      }
      if(telemetryStatus){
        telemetryStatus.hidden = false;
        telemetryStatus.textContent = `Telemetry unavailable: ${err.message}`;
      }
      const routePoints = await resolveFallbackRoutePoints();
      renderTelemetryFallback([], false, routePoints);
    }
  }

  async function initTelemetry(){
    try{
      if(mapsEnabled && mapsBrowserKey){
        await loadMaps();
        telemetryMap = new google.maps.Map(telemetryMapEl, {
          center: { lat: 39.0458, lng: -76.6413 },
          zoom: 9,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false
        });
      }else{
        const localVehicles = localMockVehicles();
        lastTelemetryVehicles = localVehicles.slice();
        lastTelemetryUsingLocalMock = true;
        const routePoints = await resolveFallbackRoutePoints();
        renderTelemetryFallback(localVehicles, true, routePoints);
      }
      await loadTelemetry();
      telemetryTimer = setInterval(loadTelemetry, Math.max(5000, Number(fareRules.telemetryRefreshSeconds || 20) * 1000));
      if(focusMyRouteOnly){
        focusMyRouteOnly.disabled = !telemetryMap;
        focusMyRouteOnly.addEventListener('change', () => {
          if(!telemetryMap) return;
          applyFocusMode();
          fitCombinedViewport();
        });
      }
    }catch(err){
      telemetryStatus.textContent = `Live map failed to load: ${err.message}`;
    }
  }

  async function submitBooking(event){
    event.preventDefault();
    clearStatus();
    setBookingOutcome('', 'pending');
    const routeDestinations = getRouteDestinations();
    const routeStops = getRouteStops();
    const destinationReady = isMultipleStopsEnabled() ? areDestinationRowsFilled() : Boolean(routeDestinations[0]);

    const payload = {
      name: $('name').value.trim(),
      phone: formatPhone($('phone').value.trim()),
      email: $('email').value.trim(),
      service: normalizeService($('service').value),
      pickup: $('pickup').value.trim(),
      destination: routeDestinations.length > 1 ? routeDestinations.join(' → ') : String(routeDestinations[0] || '').trim(),
      destinations: routeDestinations,
      multipleStops: routeDestinations.length > 1,
      stopCount: routeDestinations.length,
      routeStops,
      date: $('tripDate').value,
      time: $('tripTime').value,
      notes: $('notes').value.trim(),
      distanceMiles: Number(estimateState.miles || 0),
      estimatedDuration: estimateState.durationText || null,
      estimatedFareBeforeDiscount: Number(estimateState.preDiscountFare || estimateState.fare || 0),
      estimatedFare: Number(estimateState.fare || 0),
      memberDiscountPct: token() ? MEMBER_DISCOUNT_PCT : 0,
      memberDiscountAmount: Number(estimateState.memberSavings || 0)
    };

    if(!payload.name || !payload.phone || !payload.service || !payload.pickup || !routeDestinations.length || !payload.date || !payload.time || !destinationReady){
      setStatus('Please complete all required fields.', 'err');
      setBookingOutcome('Action required before booking', 'pending');
      if(!payload.name || !payload.phone){
        revealSectionForAction('riderDetailsSection', !payload.name ? 'name' : 'phone');
      }else if(!payload.pickup || !routeDestinations.length || !destinationReady){
        revealSectionForAction('pickupDropoffSection', !payload.pickup ? 'pickup' : 'destination');
      }else{
        revealSectionForAction('rideTypeSection', !payload.date ? 'tripDate' : 'tripTime');
      }
      return;
    }
    if(!destinationConfirmed){
      setStatus('Confirm pickup and destination details before booking.', 'err');
      setBookingOutcome('Confirm pickup and destination before booking', 'pending');
      revealSectionForAction('pickupDropoffSection', 'confirmPickupDropoffBtn');
      return;
    }

    setBusy(submitBtn, true, 'Booking...', 'Book My Ride');

    try{
      if(!estimateState.miles){
        await estimateRouteAndFare();
        payload.distanceMiles = Number(estimateState.miles || 0);
        payload.estimatedDuration = estimateState.durationText || null;
        payload.estimatedFare = Number(estimateState.fare || 0);
      }

      const headers = { 'content-type': 'application/json' };
      const accessToken = token();
      if(accessToken) headers.authorization = `Bearer ${accessToken}`;
      const r = await fetch('/api/bookings', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Booking request failed');

      const ref = data.booking?.reference || data.booking?.id || 'N/A';
      const confirmationMessage = String(data.clientMessage || data.message || '').trim();
      const pendingNotice = data.persisted===false
        ? ' Your request is pending confirmation from dispatch.'
        : '';
      const onlinePaymentEnabled = stripeEnabled || squareEnabled;
      const confirmationBase = (confirmationMessage || `Booking created. Reference: ${ref}`) + pendingNotice;
      if(onlinePaymentEnabled){
        setStatus(confirmationBase, 'ok');
      }else{
        setStatus(`${confirmationBase} Dispatch will contact you shortly to finalize payment.`, 'ok');
      }
      const isPending = data.persisted === false || r.status === 202 || String(data.booking?.status || '').toUpperCase() === 'PENDING';
      if(isPending){
        setBookingOutcome('Booking Pending', 'pending');
      }else if(onlinePaymentEnabled){
        setBookingOutcome('Booking Confirmed', 'confirmed');
      }else{
        setBookingOutcome('Booking Confirmed - Dispatch will follow up for payment', 'confirmed');
      }
      const popupMessage = confirmationMessage || `Booking created. Reference: ${ref}`;
      window.NexusTripPopup?.show({
        title: isPending ? 'Trip request received' : 'Trip booked successfully',
        message: popupMessage,
        detail: isPending
          ? 'Dispatch will confirm and finalize your trip shortly.'
          : 'Your trip is now booked and dispatch will follow up as needed.',
        accent: isPending ? '#0f766e' : '#0b1d47'
      });
      showPaymentOptions(ref, Number(data.booking?.estimatedFare ?? payload.estimatedFare ?? 0), data.requiresOnlinePayment !== false);
      bookingSubmitted = true;
      if(submitBtn) submitBtn.textContent = 'Book My Ride';
      syncSectionProgressUi();
    }catch(err){
      setStatus(err.message, 'err');
      setBookingOutcome(String(err.message || 'Booking request failed'), 'pending');
      revealSectionForAction('riderDetailsSection', 'statusMsg');
    }finally{
      setBusy(submitBtn, false, 'Booking...', 'Book My Ride');
    }
  }

  async function resolveUserAccess(){
    const accessToken = token();
    if(!accessToken){
      isAdminUser = false;
      currentUserRole = 'CUSTOMER';
      currentUser = null;
      applyRiderDetailsFromAuthUser();
      syncSectionProgressUi();
      return;
    }
    try{
      const r = await fetch('/api/auth/me', {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      if(!r.ok){
        clearAuthSession();
        isAdminUser = false;
        currentUserRole = 'CUSTOMER';
        currentUser = null;
        applyRiderDetailsFromAuthUser();
        syncSectionProgressUi();
        return;
      }
      const data = await r.json();
      currentUser = data?.user || null;
      currentUserRole = String(data?.user?.role || 'CUSTOMER').toUpperCase();
      isAdminUser = currentUserRole === 'ADMIN';
      applyRiderDetailsFromAuthUser();
      syncRiderIdentityMode();
      syncSectionProgressUi();
    }catch{
      clearAuthSession();
      isAdminUser = false;
      currentUserRole = 'CUSTOMER';
      currentUser = null;
      applyRiderDetailsFromAuthUser();
      syncRiderIdentityMode();
      syncSectionProgressUi();
    }
  }

  async function loginFromBookingApp(){
    const email = String(loginEmail?.value || '').trim();
    const password = String(loginPassword?.value || '');
    if(!email || !password){
      setLoginMessage('Enter email and password to sign in.', true);
      return;
    }
    if(authActionBtn) setBusy(authActionBtn, true, 'Signing in...', 'Sign In');
    try{
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Sign in failed');
      if(!data.token) throw new Error('Sign in failed: token missing');
      sessionStorage.setItem('nexusAccessToken', String(data.token));
      if(data.user) sessionStorage.setItem('nexusUser', JSON.stringify(data.user));
      if(loginPassword) loginPassword.value = '';
      setLoginMessage('Signed in successfully.');
      await resolveUserAccess();
      applyAuthUi();
      refreshFareForMembership();
      selectService($('service').value);
    }catch(err){
      setLoginMessage(err.message || 'Sign in failed', true);
    }finally{
      if(authActionBtn) setBusy(authActionBtn, false, 'Signing in...', 'Sign In');
    }
  }

  async function requestPasswordReset(){
    const email = String(forgotPasswordEmail?.value || loginEmail?.value || '').trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailPattern.test(email)){
      setForgotPasswordMessage('Enter a valid email address to request a reset link.', true);
      return;
    }
    if(sendResetPasswordBtn) setBusy(sendResetPasswordBtn, true, 'Sending reset...', 'Send Reset Link');
    setForgotPasswordMessage('');
    try{
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Unable to request password reset');
      setForgotPasswordMessage(data.message || 'If an account exists, a reset link has been sent.', false, data.resetUrl || '');
      if(loginEmail && !loginEmail.value) loginEmail.value = email;
    }catch(err){
      setForgotPasswordMessage(err.message || 'Unable to request password reset', true);
    }finally{
      if(sendResetPasswordBtn) setBusy(sendResetPasswordBtn, false, 'Sending reset...', 'Send Reset Link');
    }
  }

  async function logoutFromBookingApp(){
    const accessToken = token();
    try{
      if(accessToken){
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { authorization: `Bearer ${accessToken}` }
        });
      }
    }catch{}
    clearAuthSession();
    currentUser = null;
    currentUserRole = 'CUSTOMER';
    isAdminUser = false;
    applyRiderDetailsFromAuthUser();
    setLoginMessage('Signed out. Customer access restored.');
    syncRiderIdentityMode();
    applyAuthUi();
    refreshFareForMembership();
    selectService('ambulatory');
  }

  async function signupFromBookingApp(){
    const riderName = String(signupName?.value || '').trim();
    const phone = formatPhone(String(signupPhone?.value || '').trim());
    const email = String(signupEmail?.value || '').trim();
    const password = String(signupPassword?.value || '');
    const passwordConfirm = String(signupPasswordConfirm?.value || '');
    if(!riderName || !phone || !email || !password || !passwordConfirm){
      setLoginMessage('Complete all signup fields to create your rider account.', true);
      return;
    }
    if(password !== passwordConfirm){
      setLoginMessage('Passwords do not match. Please re-enter both fields.', true);
      return;
    }
    const passwordIssue = validatePasswordPolicy(password, email, riderName);
    if(passwordIssue){
      setLoginMessage(passwordIssue, true);
      return;
    }
    if(createAccountBtn) setBusy(createAccountBtn, true, 'Creating account...', 'Create Account & Save 5%');
    try{
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, name: riderName, phone })
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Sign up failed');
      if(!data.token) throw new Error('Sign up failed: token missing');
      sessionStorage.setItem('nexusAccessToken', String(data.token));
      if(data.user) sessionStorage.setItem('nexusUser', JSON.stringify(data.user));
      if(loginEmail) loginEmail.value = email;
      if(loginPassword) loginPassword.value = '';
      if(signupPassword) signupPassword.value = '';
      if(signupPasswordConfirm) signupPasswordConfirm.value = '';
      if(signUpPanel) signUpPanel.hidden = true;
      if(signUpBtn) signUpBtn.textContent = SIGNUP_CTA_LABEL;
      setLoginMessage('Account created. Member discount is now active.');
      await resolveUserAccess();
      applyAuthUi();
      refreshFareForMembership();
      selectService($('service').value);
    }catch(err){
      setLoginMessage(err.message || 'Sign up failed', true);
    }finally{
      if(createAccountBtn) setBusy(createAccountBtn, false, 'Creating account...', 'Create Account & Save 5%');
    }
  }

  async function handleAuthAction(){
    if(token()){
      await logoutFromBookingApp();
      return;
    }
    await loginFromBookingApp();
  }

  function clearManagedTripView(){
    activeManagedBooking = null;
    if(manageTripSummary){
      manageTripSummary.hidden = true;
      manageTripSummary.textContent = '';
    }
    if(manageTripActions) manageTripActions.hidden = true;
    if(manageRescheduleFields) manageRescheduleFields.hidden = true;
  }

  function renderManagedTripSummary(booking){
    if(!manageTripSummary) return;
    const route = [booking?.pickup, booking?.destination].filter(Boolean).join(' -> ');
    manageTripSummary.hidden = false;
    manageTripSummary.textContent = [
      `Reference: ${booking?.reference || booking?.id || 'N/A'}`,
      `Status: ${booking?.statusLabel || booking?.status || 'Pending'}`,
      `When: ${booking?.date || '-'} at ${booking?.time || '-'}`,
      route ? `Route: ${route}` : ''
    ].filter(Boolean).join('\n');
  }

  async function lookupManagedTrip(){
    const ref = String(manageReference?.value || '').trim();
    const phoneRaw = String(managePhone?.value || '').trim();
    const phone = formatPhone(phoneRaw);
    if(!ref || !phoneRaw){
      setManageTripMessage('Enter trip reference (or name) and phone number.', true);
      clearManagedTripView();
      return;
    }
    setManageTripMessage('Looking up trip...');
    setBusy(manageLookupBtn, true, 'Finding...', 'Find Trip');
    try{
      const r = await fetch(`/api/bookings/${encodeURIComponent(ref)}?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Trip not found');
      activeManagedBooking = data.booking || null;
      if(!activeManagedBooking) throw new Error('Trip not found');
      renderManagedTripSummary(activeManagedBooking);
      if(manageTripActions) manageTripActions.hidden = false;
      if(manageRescheduleFields) manageRescheduleFields.hidden = false;
      if(managePhone && phone && phone !== phoneRaw) managePhone.value = phone;
      setManageTripMessage('Trip found. You can reschedule or cancel below.');
    }catch(err){
      clearManagedTripView();
      setManageTripMessage(err.message || 'Unable to find that trip.', true);
    }finally{
      setBusy(manageLookupBtn, false, 'Finding...', 'Find Trip');
    }
  }

  async function cancelManagedTrip(){
    if(!activeManagedBooking?.reference){
      setManageTripMessage('Find your trip first.', true);
      return;
    }
    const phone = String(managePhone?.value || '').trim();
    if(!phone){
      setManageTripMessage('Phone number is required to cancel.', true);
      return;
    }
    setBusy(manageCancelBtn, true, 'Cancelling...', 'Cancel Trip');
    setManageTripMessage('Submitting cancellation...');
    try{
      const r = await fetch(`/api/bookings/${encodeURIComponent(activeManagedBooking.reference)}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, reason: 'Cancelled by rider from booking app' })
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Cancellation failed');
      activeManagedBooking = data.booking || activeManagedBooking;
      renderManagedTripSummary(activeManagedBooking);
      setManageTripMessage('Trip cancelled successfully.');
    }catch(err){
      setManageTripMessage(err.message || 'Unable to cancel trip.', true);
    }finally{
      setBusy(manageCancelBtn, false, 'Cancelling...', 'Cancel Trip');
    }
  }

  async function rescheduleManagedTrip(){
    if(!activeManagedBooking?.reference){
      setManageTripMessage('Find your trip first.', true);
      return;
    }
    const phone = String(managePhone?.value || '').trim();
    const date = String(manageDate?.value || '').trim();
    const time = String(manageTime?.value || '').trim();
    if(!phone || !date || !time){
      setManageTripMessage('Phone, new date, and new time are required.', true);
      return;
    }
    setBusy(manageRescheduleBtn, true, 'Rescheduling...', 'Reschedule');
    setManageTripMessage('Submitting reschedule...');
    try{
      const r = await fetch(`/api/bookings/${encodeURIComponent(activeManagedBooking.reference)}/reschedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, date, time })
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok) throw new Error(data.error || 'Reschedule failed');
      activeManagedBooking = data.booking || activeManagedBooking;
      renderManagedTripSummary(activeManagedBooking);
      setManageTripMessage('Trip rescheduled successfully.');
    }catch(err){
      setManageTripMessage(err.message || 'Unable to reschedule trip.', true);
    }finally{
      setBusy(manageRescheduleBtn, false, 'Rescheduling...', 'Reschedule');
    }
  }

  function applyRateVisibility(){
    if(rateSettingsSection){
      rateSettingsSection.hidden = !isAdminUser;
    }
    if(!isAdminUser){
      rateSourceLabel.textContent = 'Fare estimate is calculated automatically.';
    }
  }

  async function init(){
    const now = new Date();
    const hh = String(Math.max(8, now.getHours())).padStart(2, '0');
    const mm = now.getMinutes() < 30 ? '30' : '45';
    const defaultDate = now.toISOString().slice(0,10);
    const defaultTime = `${hh}:${mm}`;
    $('tripDate').value = now.toISOString().slice(0,10);
    $('tripTime').value = defaultTime;
    bindManageTripActions(defaultDate, defaultTime);
    bindAuthActions();
    seedDefaultRouteIfEmpty();

    await loadIntegrationConfig();
    await loadPlatformSettings();
    await initAddressAutocomplete();
    await resolveUserAccess();
    applyAuthUi();
    if(riderDetailsSection) riderDetailsSection.classList.add('sectionCollapsed');

    bindServiceChips();
    const requestedService = getRequestedServiceFromUrl();
    selectService(requestedService || $('service').value);
    if(isAdminUser){
      renderRateEditor($('service').value);
      saveRateBtn.addEventListener('click', saveCurrentServiceRate);
      resetRateBtn.addEventListener('click', resetCurrentServiceRate);
    }
    await initTelemetry();

    bindCoreActions();
    bindSectionProgressTracking();
    bindRouteFieldListeners($('pickup'), 'pickup');
    bindRouteFieldListeners($('destination'), 'destination');
    if(multipleStopsToggle){
      multipleStopsToggle.addEventListener('change', () => {
        markDestinationUnconfirmed();
        syncMultipleStopsUi();
      });
    }
    if(stopCountSelect){
      stopCountSelect.addEventListener('change', () => {
        markDestinationUnconfirmed();
        syncMultipleStopsUi();
      });
    }
    syncMultipleStopsUi();
    if(confirmRiderBtn) confirmRiderBtn.addEventListener('click', confirmRiderDetails);
    if(confirmPickupDropoffBtn) confirmPickupDropoffBtn.addEventListener('click', confirmPickupDropoffDetails);
    if(payStripeBtn) payStripeBtn.addEventListener('click', () => startHostedPayment('stripe', 'full'));
    if(paySquareBtn) paySquareBtn.addEventListener('click', () => startHostedPayment('square', 'full'));
    if(payDepositBtn) payDepositBtn.addEventListener('click', () => startHostedPayment('stripe', 'deposit'));
    if(payFullBtn) payFullBtn.addEventListener('click', () => startHostedPayment('stripe', 'full'));
    hidePaymentOptions();

    ['tripDate','tripTime','pickup','destination'].forEach((id) => {
      ['change','input'].forEach((evt) => {
        $(id).addEventListener(evt, () => {
          setBookingOutcome('', 'pending');
          if((id === 'tripDate' || id === 'tripTime') && estimateState.miles > 0){
            const breakdown = calculateFareBreakdown(normalizeService($('service').value), estimateState.miles, $('tripDate').value, $('tripTime').value, { durationMinutes: estimateState.durationMinutes, trafficDurationMinutes: estimateState.trafficDurationMinutes });
            renderFareEstimateBreakdown(
              breakdown,
              estimateState.miles,
              estimateState.durationText || '-',
              estimateState.durationMinutes,
              estimateState.trafficDurationMinutes
            );
          }
          autoEstimate();
        });
      });
    });

    syncSectionProgressUi();
    updateTelemetryRouteHint();
    if(String($('pickup')?.value || '').trim() && String($('destination')?.value || '').trim()){
      try{
        await estimateRouteAndFare();
      }catch{}
    }

    window.addEventListener('beforeunload', () => {
      if(telemetryTimer) clearInterval(telemetryTimer);
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => {
      bindCoreActions();
      bindAuthActions();
    }, { once: true });
  }else{
    bindCoreActions();
    bindAuthActions();
  }
  init();
})();