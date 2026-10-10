(function(){
  const $ = (id) => document.getElementById(id);
  const form = $('bookingForm');
  const estimateBtn = $('estimateBtn');
  const submitBtn = $('submitBtn');
  const bookingOutcomeStatus = $('bookingOutcomeStatus');
  const serviceChips = $('serviceChips');
  const mobilityQuestions = $('mobilityQuestions');
  const mobilityRecommendation = $('mobilityRecommendation');
  const statusMsg = $('statusMsg');
  const estMiles = $('estMiles');
  const estDuration = $('estDuration');
  const estSubtotal = $('estSubtotal');
  const estTax = $('estTax');
  const estFare = $('estFare');
  const estMemberSavingsRow = $('estMemberSavingsRow');
  const estMemberSavings = $('estMemberSavings');
  const estSavingsLabel = $('estSavingsLabel');
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
  const distanceEtaSection = $('distanceEtaSection');
  const fareMemberSavingsRow = $('fareMemberSavingsRow');
  const fareMemberSavings = $('fareMemberSavings');
  const fareSavingsLabel = $('fareSavingsLabel');
  const promotionCode = $('promotionCode');
  const applyPromotionBtn = $('applyPromotionBtn');
  const promotionMessage = $('promotionMessage');
  const farePromotionSavingsRow = $('farePromotionSavingsRow');
  const farePromotionSavings = $('farePromotionSavings');
  const fareConfirmDialog = $('fareConfirmDialog');
  const fareConfirmAmount = $('fareConfirmAmount');
  const fareConfirmDetails = $('fareConfirmDetails');
  const fareConfirmCancel = $('fareConfirmCancel');
  const fareConfirmAccept = $('fareConfirmAccept');
  const reviewFareBtn = $('reviewFareBtn');
  const nextStepGuide = $('nextStepGuide');
  const nextStepText = $('nextStepText');
  const nextStepAction = $('nextStepAction');
  const bookingNudge = $('bookingNudge');
  const bookingNudgeContinue = $('bookingNudgeContinue');
  const bookingNudgeDismiss = $('bookingNudgeDismiss');
  const journeyHeader = $('journeyHeader');
  const journeyCurrent = $('journeyCurrent');
  const journeyNext = $('journeyNext');
  const journeySegments = $('journeySegments');
  const journeyHeaderAction = $('journeyHeaderAction');
  const rideTypeSummary = $('rideTypeSummary');
  const appointmentTimeInput = $('appointmentTime');
  const scheduleBasisInput = $('scheduleBasis');
  const appointmentTimeLabel = document.querySelector('label[for="appointmentTime"]');
  const legAppointmentTimes = $('legAppointmentTimes');
  const legAppointmentTimesGrid = $('legAppointmentTimesGrid');
  const scheduleFeasibility = $('scheduleFeasibility');
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
  const patientDefaultsBanner = $('patientDefaultsBanner');
  const patientDefaultsTitle = $('patientDefaultsTitle');
  const patientDefaultsSummary = $('patientDefaultsSummary');
  const patientDefaultsList = $('patientDefaultsList');
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
  const payerType = $('payerType');
  const insuranceCarrierField = $('insuranceCarrierField');
  const insuranceCarrier = $('insuranceCarrier');
  const tripType = $('tripType');
  const roundTripFields = $('roundTripFields');
  const returnTripDate = $('returnTripDate');
  const returnTripTime = $('returnTripTime');
  const recurringRideFields = $('recurringRideFields');
  const recurrenceEndDate = $('recurrenceEndDate');
  const manifestTabPanel = $('manifestTabPanel');
  const contactTabPanel = $('contactTabPanel');
  const signedInManifest = $('signedInManifest');
  const guestManifestLookup = $('guestManifestLookup');
  const tripManifestList = $('tripManifestList');
  const guestManifestResult = $('guestManifestResult');
  let manifestTrips = [];
  let manifestRange = 'today';
  const rideGuidanceDialog = $('rideGuidanceDialog');
  const rideGuidanceForm = $('rideGuidanceForm');
  const helpChooseRideBtn = $('helpChooseRideBtn');
  const getRideRecommendationBtn = $('getRideRecommendationBtn');
  const useRideRecommendationBtn = $('useRideRecommendationBtn');
  let recommendedRideService = '';

  const FALLBACK_PRICING = {
    wheelchair:{label:'Wheelchair Transportation',base:98,includedMiles:8,perMile:4.1,waitPer15:18.75},
    ambulatory:{label:'Ambulatory Transportation',base:75,includedMiles:5,perMile:3.55,waitPer15:12.5},
    facility_transfer:{label:'Facility-to-Facility Transfer (Routine IFT)',base:165,includedMiles:8,perMile:5.25,waitPer15:30},
    facility_transfer_critical:{label:'Facility-to-Facility Transfer (High-Acuity IFT)',base:340,includedMiles:8,perMile:8.75,waitPer15:45},
    broda:{label:'Broda Chair Transportation',base:165,includedMiles:8,perMile:5.5,waitPer15:25},
    stretcher:{label:'Stretcher Transportation',base:455,includedMiles:8,perMile:7.95,waitPer15:36.25},
    bariatric:{label:'Bariatric Transportation',base:430,includedMiles:8,perMile:9.95,waitPer15:45},
    bls:{label:'BLS Ambulance',base:1125,includedMiles:0,perMile:18.5,waitPer15:50},
    als1:{label:'ALS I Ambulance',base:1395,includedMiles:0,perMile:21.5,waitPer15:62.5},
    als2:{label:'ALS II Ambulance',base:1450,includedMiles:0,perMile:24.5,waitPer15:75}
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
    afterHoursSurchargePct: 30,
    weekendSurchargePct: 30,
    holidaySurchargePct: 30,
    taxRatePct: 0,
    cancellationFee: 30,
    cancellationWindowHours: 24,
    cancellationLeadHours: 72,
    noShowFee: 50,
    freeWaitMinutes: 0,
    mileageRoundingRule: 'TENTH_MILE',
    telemetryRefreshSeconds: 20,
    maxBookingDistanceMiles: 125,
    returnMilesThreshold: 10,
    returnMilesInclusionPct: 100,
    trafficOverageFeePerHour: 0,
    trafficOverageGraceMinutes: 0,
    servicePolicies: {
      wheelchair:{cancellationFee:40,noShowFee:60,trafficOverageFeePerHour:25,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      ambulatory:{cancellationFee:35,noShowFee:50,trafficOverageFeePerHour:20,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      facility_transfer:{cancellationFee:85,noShowFee:115,trafficOverageFeePerHour:42,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      facility_transfer_critical:{cancellationFee:180,noShowFee:240,trafficOverageFeePerHour:75,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      broda:{cancellationFee:75,noShowFee:95,trafficOverageFeePerHour:35,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      stretcher:{cancellationFee:120,noShowFee:150,trafficOverageFeePerHour:50,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      bariatric:{cancellationFee:160,noShowFee:200,trafficOverageFeePerHour:65,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      bls:{cancellationFee:200,noShowFee:260,trafficOverageFeePerHour:85,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      als1:{cancellationFee:250,noShowFee:325,trafficOverageFeePerHour:95,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30},
      als2:{cancellationFee:300,noShowFee:390,trafficOverageFeePerHour:110,returnMilesInclusionPct:100,afterHoursSurchargePct:30,weekendSurchargePct:30,holidaySurchargePct:30}
    }
  };
  const DEFAULT_YARD_ADDRESS = '22505 Gateway Center Dr, Clarksburg MD 20871';
  const DEFAULT_PRETRIP_INSPECTION_MINUTES = 45;

  let mapsReadyPromise = null;
  let mapsEnabled = false;
  let mapsBrowserKey = '';
  let stripeEnabled = false;
  let previewPaymentsEnabled = false;
  let squareEnabled = false;
  let estimateState = { miles: 0, durationText: '', durationMinutes: 0, trafficDurationMinutes: 0, subtotal: 0, taxAmount: 0, preDiscountFare: 0, memberSavings: 0, discountPct: 0, fare: 0 };
  let pickupAutocomplete = null;
  let destinationAutocomplete = null;
  let selectedFlightInfo = null;
  let telemetryMap = null;
  let telemetryMarkers = new Map();
  let telemetryTimer = null;
  let bookingSheetResizeObserver = null;
  let customerRoutePolyline = null;
  let customerPickupMarker = null;
  let customerDestinationMarker = null;
  let customerIntermediateStopMarkers = [];
  let customerRouteBounds = null;
  let isAdminUser = false;
  let currentUserRole = 'CUSTOMER';
  let currentUser = null;
  let currentPatientPreferences = null;
  let platformPricing = null;
  let fareRules = { ...DEFAULT_FARE_RULES };
  let companyYardAddress = DEFAULT_YARD_ADDRESS;
  let preTripInspectionMinutes = DEFAULT_PRETRIP_INSPECTION_MINUTES;
  let yardToPickupDurationMinutes = 0;
  let yardToPickupTrafficDurationMinutes = 0;
  let deadheadRouteMiles = { toPickup:0, fromDestination:0, fromReturn:0 };
  let currentBookingReference = '';
  let currentBookingFare = 0;
  let bookingSubmitted = false;
  let bookingSubmissionPending = false;
  let routeEstimateVersion = 0;
  let editingBookingReference = '';
  let paymentRequiredForBooking = false;
  let fareEstimateSignature = '';
  let confirmedFareSignature = '';
  let fareSubmissionAuthorized = false;
  let appliedPromotion = null;
  let lastPromptedFareSignature = '';
  let draftSaveTimer = null;
  let bookingNudgeTimer = null;
  const bookingDraftToken = (()=>{try{const existing=sessionStorage.getItem('nexusBookingDraftToken');if(existing)return existing;const created=crypto.randomUUID();sessionStorage.setItem('nexusBookingDraftToken',created);return created;}catch{return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;}})();
  let destinationConfirmed = false;
  let riderDetailsConfirmed = false;
  let rideChoiceConfirmed = false;
  let journeyNavigationOverride = '';
  let activeManagedBooking = null;
  let destinationStopDraftCache = [];
  let legAppointmentTimeDraftCache = [];
  let routeLegTravelMinutes = [];
  const locationSuggestionCache = new Map();
  const routePointCache = new Map();
  let lastTelemetryVehicles = [];
  let lastTelemetryUsingLocalMock = false;
  let coreActionsBound = false;
  let authActionsBound = false;
  let manageActionsBound = false;
  let lastTrackedBookingStep = '';
  const PRIVILEGED_SERVICE_ROLES = new Set(['ADMIN','DISPATCHER','FACILITY','DRIVER']);
  const CUSTOMER_ALLOWED_SERVICES = new Set(['ambulatory','wheelchair','stretcher','bariatric']);
  const AUTO_COLLAPSIBLE_SECTION_IDS = ['pickupDropoffSection'];
  const PROGRESSIVE_SECTIONS_ORDER = ['riderDetailsSection', 'pickupDropoffSection', 'rideTypeSection', 'telemetrySection', 'fareSummarySection'];
  const FINAL_HIDDEN_SECTION_IDS = ['bookingLoginSection', 'riderDetailsSection', 'pickupDropoffSection', 'rideTypeSection', 'rateSettingsSection'];
  const finalVisibleSectionIds = new Set(['telemetrySection', 'distanceEtaSection', 'fareSummarySection', 'paymentSection']);
  const expandedSections = new Set();
  const riderDetailsInitiallyCollapsed = new Set();
  const LOCATION_STATE_CODE = 'MD';
  const MARYLAND_SUFFIX = 'maryland';
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
  const CARD_PROCESSING_FEE_PCT = 3;
  const SIGNUP_CTA_LABEL = 'Sign Up & Save up to 10%';

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
    if(bookingSubmitted || bookingSubmissionPending) return;
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
    const signedIn = Boolean(token());
    const tripSchedule = String(tripType?.value || 'ONE_WAY').toUpperCase();
    const isRepeatSchedule = tripSchedule === 'ROUND_TRIP' || tripSchedule === 'RECURRING';
    const discountPct = isRepeatSchedule ? (signedIn ? 10 : 5) : (signedIn ? MEMBER_DISCOUNT_PCT : 0);
    const {fullFare,total,memberSavings}=NexusFare.applySavings(baseTotal,discountPct);
    return { fullFare, memberSavings, total, signedIn, discountPct, isRepeatSchedule };
  }

  function updateTripScheduleSavingsMessage(signedIn=Boolean(token())){
    const message=$('tripScheduleSavingsMessage');
    const tripSchedule=String(tripType?.value||'ONE_WAY').toUpperCase();
    const isRepeatSchedule=tripSchedule==='ROUND_TRIP'||tripSchedule==='RECURRING';
    let copy='';
    if(isRepeatSchedule){
      const rideLabel=tripSchedule==='ROUND_TRIP'?'round-trip':'recurring';
      copy=signedIn?`10% savings applied to this ${rideLabel} ride.`:`Save 5% on this ${rideLabel} ride. Sign in for 10% savings.`;
      if(tripSchedule==='ROUND_TRIP') copy=`Round-trip fare includes both outbound and return legs. ${copy}`;
    }else{
      copy=signedIn?'Members save 5% on one-way rides. Choose round-trip or recurring for 10% savings.':'Round-trip and recurring rides save 5%. Sign in to save 10%.';
    }
    if(message)message.textContent=copy;
    if(memberDiscountNote)memberDiscountNote.textContent=copy;
  }

  function renderFareEstimateBreakdown(breakdown, miles, durationText, durationMinutes = 0, trafficDurationMinutes = 0){
    appliedPromotion = null;
    if(farePromotionSavingsRow) farePromotionSavingsRow.hidden = true;
    if(promotionMessage) promotionMessage.textContent = promotionCode?.value ? 'Reapply the coupon after ride details or pricing change.' : '';
    const discountView = pricingWithMembership(breakdown.total);
    updateTripScheduleSavingsMessage(discountView.signedIn);
    estimateState = {
      miles: Math.max(0, Number(miles || 0)),
      durationText: String(durationText || ''),
      durationMinutes: Math.max(0, Number(durationMinutes || 0)),
      trafficDurationMinutes: Math.max(0, Number(trafficDurationMinutes || 0)),
      subtotal: Number(breakdown.subtotal || 0),
      taxAmount: Number(breakdown.taxAmount || 0),
      preDiscountFare: discountView.fullFare,
      memberSavings: discountView.memberSavings,
      discountPct: discountView.discountPct,
      fare: discountView.total,
      deadheadCharge:Number(breakdown.deadheadCharge || 0), shortNoticeCharge:Number(breakdown.shortNoticeCharge || 0), deadheadSegments:breakdown.deadheadSegments || []
    };

    estMiles.textContent = `${estimateState.miles.toFixed(1)} mi`;
    estDuration.textContent = durationText || '-';
    const selectedRate=getPricing(normalizeService($('service').value));
    const mileageCopy=`Each leg: $${Number(selectedRate.base||0).toFixed(2)} base includes ${Number(selectedRate.includedMiles||0)} miles; additional miles are $${Number(selectedRate.perMile||0).toFixed(2)} each. This route has ${Number(breakdown.billableMilesPerLeg||0).toFixed(1)} additional miles per leg.`;
    if(rateSourceLabel)rateSourceLabel.textContent=mileageCopy;
    ['fareSummaryMileage','fareConfirmMileage'].forEach(id=>{
      if($(id)){ $(id).textContent=mileageCopy; $(id).hidden=Number(miles||0)<=0; }
    });
    const premiumReasons={ 'after-hours':'after-hours', weekend:'weekend', holiday:'holiday' };
    const premiumLegs=[breakdown.premiumRateReason?`${String(tripType?.value||'')==='ROUND_TRIP'?'Outbound':'Ride'}: +30% ${premiumReasons[breakdown.premiumRateReason]}`:'',breakdown.returnPremiumRateReason?`Return: +30% ${premiumReasons[breakdown.returnPremiumRateReason]}`:''].filter(Boolean);
    if($('estPremiumRow')) $('estPremiumRow').hidden=!premiumLegs.length;
    if($('estPremiumCharge')) $('estPremiumCharge').textContent=`$${Number(breakdown.premiumAmount||0).toFixed(2)}`;
    ['fareSummaryPremium','fareConfirmPremium'].forEach(id=>{
      if($(id)){ $(id).textContent=premiumLegs.join('. '); $(id).hidden=!premiumLegs.length; }
    });
    const waiting=getWaitingCharge(normalizeService($('service').value));
    if($('estDeadheadRow')) $('estDeadheadRow').hidden = !(breakdown.deadheadCharge > 0);
    if($('estDeadheadCharge')) $('estDeadheadCharge').textContent = `$${Number(breakdown.deadheadCharge || 0).toFixed(2)}`;
    if($('estShortNoticeRow')) $('estShortNoticeRow').hidden = !(breakdown.shortNoticeCharge > 0);
    if($('estShortNoticeCharge')) $('estShortNoticeCharge').textContent = `$${Number(breakdown.shortNoticeCharge || 0).toFixed(2)}`;
    ['fareSummaryOperational','fareConfirmOperational'].forEach(id=>{
      if($(id)){
        $(id).textContent = `Deadhead mileage: $${Number(breakdown.deadheadCharge || 0).toFixed(2)}. Each empty segment includes ${Number(breakdown.includedMiles || 0)} miles; excess miles cost $${Number(breakdown.deadheadRate || 0).toFixed(2)} each. Pickup within 24 hours of booking: $${Number(breakdown.shortNoticeCharge || 0).toFixed(2)} (30% of the base fare for each qualifying leg).`;
        $(id).hidden = !(breakdown.deadheadCharge > 0 || breakdown.shortNoticeCharge > 0);
      }
    });
    if($('estWaitRow')) $('estWaitRow').hidden=waiting.waitMinutes<=0;
    if($('estWaitLabel')) $('estWaitLabel').textContent=`Waiting (${waiting.waitMinutes} min; ${waiting.billableWaitMinutes} billable)`;
    if($('estWaitCharge')) $('estWaitCharge').textContent=`$${waiting.waitCharge.toFixed(2)}`;
    const waitingCopy=waiting.waitMinutes>0?`Includes ${waiting.waitMinutes} minutes of driver waiting: $${waiting.waitCharge.toFixed(2)} before savings and card processing. Waiting starts immediately at $${waiting.waitPer15.toFixed(2)} per started 15 minutes.`:'';
    ['fareSummaryWaiting','fareConfirmWaiting'].forEach(id=>{
      if($(id)){ $(id).textContent=waitingCopy; $(id).hidden=!waitingCopy; }
    });
    syncCalculatedWaitingUi();
    if($('waitPricingHint')) $('waitPricingHint').textContent=`Calculated from arrival to the next pickup. $${waiting.waitPer15.toFixed(2)} per started 15 minutes, starting immediately.`;
    if(estSubtotal) estSubtotal.textContent = `$${Number(breakdown.subtotal || 0).toFixed(2)}`;
    if(estTax) estTax.textContent = `$${Number(breakdown.taxAmount || 0).toFixed(2)}${Number(breakdown.taxRatePct || 0) > 0 ? ` (${Number(breakdown.taxRatePct || 0).toFixed(2)}%)` : ''}`;
    if(estMemberSavingsRow) estMemberSavingsRow.hidden = discountView.discountPct <= 0;
    if(estSavingsLabel) estSavingsLabel.textContent = `${discountView.signedIn?'Member':'Schedule'} Savings (${discountView.discountPct}%)`;
    if(estMemberSavings) estMemberSavings.textContent = discountView.discountPct > 0 ? `-$${discountView.memberSavings.toFixed(2)}` : '-';
    estFare.textContent = `$${discountView.total.toFixed(2)}`;
    if(fareMemberSavingsRow) fareMemberSavingsRow.hidden = discountView.discountPct <= 0;
    if(fareSavingsLabel) fareSavingsLabel.textContent = `${discountView.signedIn?'Member':'Schedule'} Savings (${discountView.discountPct}%)`;
    if(fareMemberSavings) fareMemberSavings.textContent = discountView.discountPct > 0 ? `-$${discountView.memberSavings.toFixed(2)}` : '-';
    if(memberDiscountNote){
      memberDiscountNote.textContent = discountView.discountPct > 0
        ? `${discountView.signedIn?'Member':'Schedule'} savings active: ${discountView.discountPct}% off this ride.`
        : `Sign in to save ${MEMBER_DISCOUNT_PCT}% on one-way rides, or choose a round-trip or recurring schedule to save 5%.`;
      if(String(tripType?.value||'').toUpperCase()==='ROUND_TRIP'){
        memberDiscountNote.textContent=`Round-trip fare includes both outbound and return legs. ${memberDiscountNote.textContent}`;
      }
    }
    applyScheduleTimeCalculation();
    renderRideMarketplace();
  }

  async function applySpecialPromotion(){
    const code=String(promotionCode?.value||'').trim().toUpperCase();
    const service=normalizeService($('service')?.value||'');
    const date=String($('tripDate')?.value||'');
    if(!code||!service||!date||Number(estimateState.fare||0)<=0){
      if(promotionMessage) promotionMessage.textContent='Complete the ride type, date, and fare estimate before applying a coupon.';
      return;
    }
    setBusy(applyPromotionBtn,true,'Applying...','Apply');
    autoEstimate.cancel();
    routeEstimateVersion++;
    const originalFare=Number(appliedPromotion?.originalFare ?? estimateState.fare ?? 0);
    try{
      const r=await fetch('/api/promotions/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,service,date,currentFare:originalFare})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||'Coupon could not be applied');
      appliedPromotion={code,originalFare,total:Number(data.total),savings:Number(data.savings||0),percentOff:Number(data.percentOff||0)};
      estimateState.fare=appliedPromotion.total;
      if(estFare)estFare.textContent=`$${appliedPromotion.total.toFixed(2)}`;
      if(fareSummaryAmount)fareSummaryAmount.textContent=`$${appliedPromotion.total.toFixed(2)}`;
      if(farePromotionSavingsRow)farePromotionSavingsRow.hidden=false;
      if(farePromotionSavings)farePromotionSavings.textContent=`-$${appliedPromotion.savings.toFixed(2)}`;
      if(promotionMessage)promotionMessage.textContent=`Coupon applied${appliedPromotion.percentOff?`: ${appliedPromotion.percentOff}% off`:''}. Your discounted total is $${appliedPromotion.total.toFixed(2)}.`;
      confirmedFareSignature=''; fareSubmissionAuthorized=false; updateFareConfirmationState(); syncSectionProgressUi();
    }catch(err){
      appliedPromotion=null;
      estimateState.fare=originalFare;
      if(estFare)estFare.textContent=`$${originalFare.toFixed(2)}`;
      if(fareSummaryAmount)fareSummaryAmount.textContent=`$${originalFare.toFixed(2)}`;
      if(farePromotionSavingsRow)farePromotionSavingsRow.hidden=true;
      if(promotionMessage)promotionMessage.textContent=err.message;
      confirmedFareSignature=''; fareSubmissionAuthorized=false; updateFareConfirmationState(); syncSectionProgressUi();
    }finally{setBusy(applyPromotionBtn,false,'Applying...','Apply');}
  }

  applyPromotionBtn?.addEventListener('click',applySpecialPromotion);

  function renderRideMarketplace(){
    if(!serviceChips)return;
    const miles=Number(estimateState.miles||0);
    const date=String($('tripDate')?.value||new Date().toISOString().slice(0,10));
    const time=String($('tripTime')?.value||appointmentTimeInput?.value||'10:00');
    const etaByService={ambulatory:'15–25 min',wheelchair:'30–45 min',stretcher:'Dispatch review',bariatric:'Dispatch review'};
    serviceChips.querySelectorAll('.serviceCard').forEach((chip)=>{
      const service=normalizeService(chip.dataset.service);
      let meta=chip.querySelector('.serviceCardMarketMeta');
      if(!meta){
        meta=document.createElement('span');
        meta.className='serviceCardMarketMeta';
        meta.innerHTML='<span class="serviceCardEta"></span><span class="serviceCardFare"></span>';
        chip.appendChild(meta);
      }
      const eta=meta.querySelector('.serviceCardEta');
      const fare=meta.querySelector('.serviceCardFare');
      if(eta)eta.textContent=etaByService[service]||'By request';
      const requiresReview=service==='stretcher'||service==='bariatric';
      if(fare){
        const total=miles>0?pricingWithMembership(calculateFareBreakdown(service,miles,date,time,{durationMinutes:estimateState.durationMinutes,trafficDurationMinutes:estimateState.trafficDurationMinutes}).total).total:0;
        fare.textContent=requiresReview&&!total?'Review':(total?`$${total.toFixed(2)}`:'Estimate');
        fare.classList.toggle('review',requiresReview&&!total);
      }
    });
    const selected=normalizeService($('service')?.value);
    const selectedChip=serviceChips.querySelector(`[data-service="${selected}"]`);
    const selectedName=selectedChip?.querySelector('.serviceCardName')?.textContent?.trim()||'';
    const continueButton=$('continueRideBtn');
    if(continueButton){
      continueButton.textContent='Book My Ride';
      continueButton.title=selectedName?`Book the selected ${selectedName} ride`:'Select a Nexus ride to continue';
      continueButton.setAttribute('aria-label',selectedName?`Book My Ride: ${selectedName}`:'Book My Ride');
      continueButton.disabled=!selected;
    }
  }

  function reorganizeBookingFlow(){
    if(!form)return;
    document.body.classList.add('bookingUberFlow');
    const login=$('bookingLoginSection');
    const route=$('pickupDropoffSection');
    const map=$('telemetrySection');
    const ride=$('rideTypeSection');
    const rider=$('riderDetailsSection');
    if(!login||!route||!map||!ride||!rider)return;
    login.after(rider);
    rider.after(route);
    route.after(map);
    map.after(ride);
    const routeScheduleFields=$('routeScheduleFields');
    const routeConfirmActions=confirmPickupDropoffBtn?.closest('.authActions');
    if(routeScheduleFields&&routeConfirmActions)route.insertBefore(routeScheduleFields,routeConfirmActions);
    if(window.ResizeObserver&&!bookingSheetResizeObserver){
      bookingSheetResizeObserver=new ResizeObserver(()=>syncMapViewport());
      [ride,$('fareSummarySection'),paymentSection].filter(Boolean).forEach((section)=>bookingSheetResizeObserver.observe(section));
    }
  }

  function refreshFareForMembership(){
    updateTripScheduleSavingsMessage();
    const subtotal = Number(estimateState.subtotal || 0);
    const taxAmount = Number(estimateState.taxAmount || 0);
    if(subtotal <= 0 && taxAmount <= 0 && Number(estimateState.fare || 0) <= 0) return;
    const breakdown=calculateFareBreakdown(normalizeService($('service').value),estimateState.miles,$('tripDate').value,resolveFareTimeForEstimate(),{
      durationMinutes:estimateState.durationMinutes,
      trafficDurationMinutes:estimateState.trafficDurationMinutes
    });
    renderFareEstimateBreakdown(breakdown, estimateState.miles, estimateState.durationText || '-', estimateState.durationMinutes, estimateState.trafficDurationMinutes);
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

  function getLegAppointmentTimeInputs(){
    return [appointmentTimeInput, ...Array.from(legAppointmentTimesGrid?.querySelectorAll('[data-leg-appointment-time="true"]') || [])].filter(Boolean);
  }

  function getLegAppointments(){
    const timeInputs = getLegAppointmentTimeInputs();
    return getDestinationInputs().map((destinationInput, index) => ({
      leg: index + 1,
      destination: String(destinationInput?.value || '').trim(),
      appointmentTime: String(timeInputs[index]?.value || '').trim()
    }));
  }

  function areLegAppointmentTimesComplete(){
    const appointments = getLegAppointments();
    return appointments.length > 0 && appointments.every((item) => Boolean(item.appointmentTime));
  }

  function getStopWaitInputs(){
    return Array.from(legAppointmentTimesGrid?.querySelectorAll('[data-stop-wait-minutes="true"]') || []);
  }

  function getStopWaitMinutes(){
    return getCalculatedWaiting().stopWaitMinutes;
  }

  function getAdditionalWaitMinutes(){
    return getCalculatedWaiting().returnWaitMinutes;
  }

  function getCalculatedWaiting(routeMetrics = estimateState, service = normalizeService($('service')?.value)){
    const appointments = getLegAppointments();
    const hasRoute = Math.max(Number(routeMetrics.durationMinutes || 0), Number(routeMetrics.trafficDurationMinutes || 0)) > 0;
    const stopWaitMinutes = appointments.slice(0, -1).map((item, index) => {
      const current = parseTimeToMinutes(item.appointmentTime);
      const next = parseTimeToMinutes(appointments[index + 1].appointmentTime);
      const travel = Number(routeLegTravelMinutes[index + 1] || 0);
      if(!hasRoute || !travel || current == null || next == null) return 0;
      const departure = next - 15 - Math.ceil(travel) - serviceTransitionBufferMinutes(service);
      return Math.max(0, departure - (current - 15));
    });
    let returnWaitMinutes = 0;
    if(hasRoute && String(tripType?.value || '').toUpperCase() === 'ROUND_TRIP'){
      const appointment = parseTimeToMinutes(appointments[appointments.length - 1]?.appointmentTime || '');
      const outboundPickup = parseTimeToMinutes($('tripTime')?.value || '');
      const travel = Math.ceil(Math.max(Number(routeMetrics.durationMinutes || 0), Number(routeMetrics.trafficDurationMinutes || 0)));
      const arrival = isPickupTimeBasis() && outboundPickup != null ? outboundPickup + travel : (appointment == null ? null : appointment - 15);
      const pickup = parseTimeToMinutes(returnTripTime?.value || '');
      const outboundDate = Date.parse(`${$('tripDate')?.value}T00:00:00Z`);
      const returnDate = Date.parse(`${returnTripDate?.value}T00:00:00Z`);
      if(arrival != null && pickup != null && Number.isFinite(outboundDate) && Number.isFinite(returnDate)){
        returnWaitMinutes = Math.max(0, Math.round((returnDate - outboundDate) / 60000) + pickup - arrival);
      }
    }
    return { stopWaitMinutes, returnWaitMinutes, waitMinutes: returnWaitMinutes + stopWaitMinutes.reduce((sum, value) => sum + value, 0) };
  }

  function syncCalculatedWaitingUi(){
    const waiting = getCalculatedWaiting();
    const visible = String(tripType?.value || '').toUpperCase() === 'ROUND_TRIP' || isMultipleStopsEnabled();
    if($('waitTimeField')) $('waitTimeField').hidden = !visible;
    $('pickupWaitPair')?.classList.toggle('hasWaiting', visible);
    if($('waitMinutes')) $('waitMinutes').value = String(waiting.waitMinutes);
    getStopWaitInputs().forEach((input, index) => { input.value = String(waiting.stopWaitMinutes[index] || 0); });
    syncStopPickupTimesUi();
  }

  function syncStopPickupTimesUi(){
    const appointments = getLegAppointments();
    appointments.slice(0, -1).forEach((item, index) => {
      const input = $(`stopPickupTime-${index + 1}`);
      const next = parseTimeToMinutes(appointments[index + 1].appointmentTime);
      const travel = Number(routeLegTravelMinutes[index + 1] || 0);
      if(input) input.value = next != null && travel > 0 ? minutesToTime(next - 15 - Math.ceil(travel) - serviceTransitionBufferMinutes()) : '';
    });
  }

  function getWaitingCharge(service, routeMetrics = estimateState){
    const { waitMinutes } = getCalculatedWaiting(routeMetrics, service);
    const freeWaitMinutes = 0;
    const billableWaitMinutes = Math.max(0, waitMinutes - freeWaitMinutes);
    const waitPer15 = Math.max(0, Number(getPricing(service).waitPer15) || 0);
    const waitCharge = Math.ceil(billableWaitMinutes / 15) * waitPer15;
    return { waitMinutes, freeWaitMinutes, billableWaitMinutes, waitCharge, waitPer15 };
  }

  function serviceTransitionBufferMinutes(service = normalizeService($('service')?.value)){
    if(service === 'wheelchair') return 15;
    if(service === 'stretcher' || service === 'bariatric') return 25;
    return 10;
  }

  function evaluateMultiStopFeasibility(){
    const appointments = getLegAppointments();
    if(appointments.length < 2) return { feasible: true, checks: [], message: '' };
    if(!areLegAppointmentTimesComplete()) return { feasible: false, pending: true, checks: [], message: 'Enter an appointment time for every stop.' };
    if(routeLegTravelMinutes.length < appointments.length) return { feasible: false, pending: true, checks: [], message: 'Calculate the route to check travel time and traffic between stops.' };
    const waits = getStopWaitMinutes();
    const assistanceBuffer = serviceTransitionBufferMinutes();
    const checks = [];
    for(let index = 0; index < appointments.length - 1; index += 1){
      const current = parseTimeToMinutes(appointments[index].appointmentTime);
      const next = parseTimeToMinutes(appointments[index + 1].appointmentTime);
      const wait = Math.max(0, Number(waits[index] || 0));
      const travel = Math.max(1, Math.ceil(Number(routeLegTravelMinutes[index + 1] || 0)));
      const earliestArrival = current - 15 + wait + assistanceBuffer + travel;
      checks.push({ fromLeg: index + 1, toLeg: index + 2, waitMinutes: wait, assistanceBuffer, travelMinutes: travel, earliestArrival, appointmentMinutes: next, cushionMinutes: next - 15 - earliestArrival });
    }
    const conflicts = checks.filter((check) => check.cushionMinutes < 0);
    if(conflicts.length){
      const first = conflicts[0];
      return { feasible: false, checks, message: `Schedule conflict: Stop ${first.toLeg} is at least ${Math.abs(first.cushionMinutes)} minutes too early for one driver. Allow ${first.waitMinutes} minutes at Stop ${first.fromLeg}, ${first.assistanceBuffer} minutes for rider assistance, and about ${first.travelMinutes} minutes of travel.` };
    }
    const tightest = checks.reduce((minimum, check) => Math.min(minimum, check.cushionMinutes), Infinity);
    return { feasible: true, checks, message: `Schedule appears feasible for one driver, with a minimum ${Math.max(0, Math.floor(tightest))}-minute cushion. Travel, expected stop time, traffic, and rider assistance are included.` };
  }

  function renderMultiStopFeasibility(){
    if(!scheduleFeasibility) return evaluateMultiStopFeasibility();
    const result = evaluateMultiStopFeasibility();
    scheduleFeasibility.className = `scheduleFeasibility ${result.pending ? 'pending' : (result.feasible ? 'feasible' : 'conflict')}`;
    scheduleFeasibility.textContent = result.message || 'Complete the route and stop schedule to check feasibility.';
    return result;
  }

  function syncLegAppointmentDestinationLabels(){
    getDestinationInputs().slice(1).forEach((input, index) => {
      const label = legAppointmentTimesGrid?.querySelector(`[data-leg-destination="${index + 2}"]`);
      if(label) label.textContent = String(input.value || '').trim() || `Destination ${index + 2}`;
    });
  }

  function syncLegAppointmentTimesUi(){
    const enabled = isMultipleStopsEnabled();
    if(appointmentTimeLabel) appointmentTimeLabel.textContent = enabled ? 'Stop 1 Appointment Time' : 'Appointment Time';
    if(!legAppointmentTimes || !legAppointmentTimesGrid) return;
    const existingTimes = Array.from(legAppointmentTimesGrid.querySelectorAll('[data-leg-appointment-time="true"]')).map((input) => String(input.value || ''));
    if(existingTimes.length) legAppointmentTimeDraftCache = existingTimes;
    legAppointmentTimesGrid.innerHTML = '';
    legAppointmentTimes.hidden = !enabled;
    if(!enabled) return;
    const stopCount = getStopCount();
    for(let index = 1; index <= stopCount; index += 1){
      if(index > 1){
        const field = document.createElement('div');
        field.className = 'field';
        field.innerHTML = `<label for="appointmentTime-${index}">Stop ${index} Appointment Time</label><input id="appointmentTime-${index}" name="appointmentTime-${index}" type="time" data-leg-appointment-time="true" required><small class="legAppointmentDestination" data-leg-destination="${index}">Destination ${index}</small>`;
        const input = field.querySelector('input');
        if(input) input.value = legAppointmentTimeDraftCache[index - 2] || '';
        ['change', 'input', 'blur'].forEach((eventName) => input?.addEventListener(eventName, () => {
          fareEstimateSignature = '';
          confirmedFareSignature = '';
          refreshFareForMembership();
          renderMultiStopFeasibility();
          syncSectionProgressUi();
        }));
        legAppointmentTimesGrid.appendChild(field);
      }
      if(index < stopCount){
        const waitField = document.createElement('div');
        waitField.className = 'pickupWaitPair hasWaiting stopWaitField';
        waitField.innerHTML = `<div class="field"><label for="stopPickupTime-${index}">Stop ${index} Pickup Time</label><input id="stopPickupTime-${index}" type="time" readonly class="systemGeneratedField"><small class="subtle">Calculated from the next appointment, travel, and rider assistance.</small></div><div class="field"><label for="stopWaitMinutes-${index}">Waiting (minutes)</label><input id="stopWaitMinutes-${index}" type="number" readonly data-stop-wait-minutes="true" class="systemGeneratedField" value="0"></div>`;
        legAppointmentTimesGrid.appendChild(waitField);
      }
    }
    syncLegAppointmentDestinationLabels();
    syncCalculatedWaitingUi();
    renderMultiStopFeasibility();
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
          syncLegAppointmentDestinationLabels();
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

    syncLegAppointmentTimesUi();
    syncCalculatedWaitingUi();
    refreshFareForMembership();
    updateTelemetryRouteHint();
    syncSectionProgressUi();
  }

  async function confirmPickupDropoffDetails(){
    const pickup = String($('pickup')?.value || '').trim();
    const destinations = getRouteDestinations();
    const destinationReady = isMultipleStopsEnabled() ? areDestinationRowsFilled() : Boolean(destinations[0]);
    if(!pickup || !destinationReady){
      setStatus('Enter pickup and all destination stops, then confirm details.', 'err');
      markDestinationUnconfirmed();
      syncSectionProgressUi();
      return;
    }
    if(!$('tripDate')?.value||!isPrimaryScheduleInputComplete()){
      setStatus(isMultipleStopsEnabled() ? 'Choose the trip date and enter an appointment time for every destination stop.' : 'Choose the trip date and enter either a pickup or appointment time.', 'err');
      (!$('tripDate')?.value ? $('tripDate') : (isPickupTimeBasis() ? $('tripTime') : appointmentTimeInput))?.focus();
      return;
    }
    const previouslySelectedService=normalizeService($('service')?.value);
    if(!previouslySelectedService)selectService('ambulatory');
    autoEstimate.cancel();
    setBusy(confirmPickupDropoffBtn,true,'Calculating prices...','Confirm Details');
    try{await estimateRouteAndFare({promptConfirmation:false});}
    finally{setBusy(confirmPickupDropoffBtn,false,'Calculating prices...','Confirm Details');}
    if(!Number(estimateState.miles||0))return;
    const feasibility = renderMultiStopFeasibility();
    if(isMultipleStopsEnabled() && !feasibility.feasible && !feasibility.pending){
      setStatus(feasibility.message, 'err');
      return;
    }
    applyScheduleTimeCalculation();
    if(!$('tripTime')?.value){
      setStatus('We could not calculate this schedule. Check the selected time.', 'err');
      (isPickupTimeBasis() ? $('tripTime') : appointmentTimeInput)?.focus();
      return;
    }
    if(!previouslySelectedService)selectService('');
    markDestinationConfirmed();
    journeyNavigationOverride='';
    const serviceCatalogDetails=$('serviceCatalogDetails');
    if(serviceCatalogDetails)serviceCatalogDetails.open=true;
    expandedSections.delete('pickupDropoffSection');
    setStatus('Pickup and destination confirmed.', 'ok');
    syncSectionProgressUi();
    PROGRESSIVE_SECTIONS_ORDER.forEach((sectionId)=>$(sectionId)?.classList.remove('currentBookingCard'));
    $('rideTypeSection')?.classList.add('unlocked','currentBookingCard');
    $('rideTypeSection')?.scrollIntoView({behavior:'smooth',block:'start'});
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
    if($('staffTripModeField')) $('staffTripModeField').hidden = !['ADMIN','DISPATCHER'].includes(String(currentUserRole||'').toUpperCase());
    const role = String(currentUserRole || 'CUSTOMER').toUpperCase();
    const signedIn = Boolean(token());
    if(authRoleBadge) authRoleBadge.textContent = signedIn ? role : 'CUSTOMER';
    if(authStatusText){
      if(isPrivilegedServiceRole(role)) authStatusText.textContent = `Signed in as ${role}. You can view all ride types.`;
      else if(signedIn) authStatusText.textContent = `Signed in as ${role}. Save 5% on one-way and 10% on round-trip or recurring rides.`;
      else authStatusText.textContent = 'Book as a guest and save 5% on round-trip or recurring rides. Sign up to save 10%.';
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
    updateTripScheduleSavingsMessage(signedIn);
    if(paymentChoiceHint){
      if(role === 'FACILITY' || role === 'ADMIN' || role === 'BILLING'){
        paymentChoiceHint.textContent = 'Facility and staff-entered invoice bookings are sent to the billing email on file.';
      }else if(role === 'DISPATCHER'){
        paymentChoiceHint.textContent = 'Dispatch-entered bookings send the rider a secure payment link before pickup.';
      }else if(role === 'DRIVER'){
        paymentChoiceHint.textContent = 'Driver-entered bookings send rider details and trigger a referral incentive alert for admin follow-up.';
      }else if(isRiderRole(role)){
        paymentChoiceHint.textContent = 'A secure payment link will be sent to your phone 60 to 30 minutes before pickup.';
      }else{
        paymentChoiceHint.textContent = 'A secure payment link is sent before pickup. You can also complete payment after booking confirmation.';
      }
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
    const pickupComplete = Boolean(String($('pickup')?.value || '').trim() && getRouteDestinations().length > 0 && destinationConfirmed && areDestinationRowsFilled());
    const rideTypeComplete = pickupComplete && rideChoiceConfirmed && Boolean(normalizeService($('service')?.value) && $('tripDate')?.value && isPrimaryScheduleInputComplete() && $('tripTime')?.value);
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
      const serviceLabel = String(selectedChip?.textContent || selected || '-').trim() || '-';
      const dateLabel = String($('tripDate')?.value || '-').trim() || '-';
      const appointmentLabel = String(appointmentTimeInput?.value || '-').trim() || '-';
      const pickupLabel = String($('tripTime')?.value || '-').trim() || '-';
      rideTypeSummary.textContent = `Service: ${serviceLabel} | Date: ${dateLabel} | Appointment: ${appointmentLabel} | Pickup: ${pickupLabel}`;
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
    const reviewServiceValue = normalizeService($('service')?.value);
    const reviewServiceChip = Array.from(serviceChips?.querySelectorAll('.chip') || []).find((chip) => normalizeService(chip.dataset.service) === reviewServiceValue);
    const reviewServiceLabel = String(reviewServiceChip?.querySelector('.serviceCardName')?.textContent || reviewServiceChip?.textContent || reviewServiceValue || '-').trim();
    if($('reviewRider')) $('reviewRider').textContent = String($('name')?.value || '-').trim() || '-';
    if($('reviewRoute')) $('reviewRoute').textContent = `${String($('pickup')?.value || '-').trim() || '-'} to ${getRouteDestinations().join(' → ') || '-'}`;
    if($('reviewSchedule')) $('reviewSchedule').textContent = `${String($('tripDate')?.value || '-')} at ${String(appointmentTimeInput?.value || '-')}`;
    if($('reviewScheduleSummary')) $('reviewScheduleSummary').textContent = `${String($('tripDate')?.value || 'Date pending')} at ${String(appointmentTimeInput?.value || 'time pending')} · Pickup estimate ${String($('tripTime')?.value || 'pending')}`;
    if($('rideSchedulePillText')) $('rideSchedulePillText').textContent = $('tripTime')?.value ? `Pickup ${String($('tripTime').value)}` : 'Scheduled pickup';
    if($('rideRiderPillText')) $('rideRiderPillText').textContent = String($('name')?.value || 'For rider').trim() || 'For rider';
    if($('reviewService')) $('reviewService').textContent = reviewServiceLabel;

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
        shouldUnlock = true;
      }else if(sectionId === 'pickupDropoffSection'){
        shouldUnlock = riderDetailsConfirmed;
      }else if(sectionId === 'rideTypeSection' || sectionId === 'telemetrySection'){
        shouldUnlock = destinationConfirmed;
      }else if(sectionId === 'fareSummarySection'){
        shouldUnlock = progress.allRequiredComplete;
      }
      
      if(shouldUnlock){
        section.classList.add('unlocked');
      }else{
        section.classList.remove('unlocked');
      }
    });

    const calculatedBookingCardId = !riderDetailsConfirmed
      ? 'riderDetailsSection'
      : !progress.pickupDropoffSection
        ? 'pickupDropoffSection'
      : !progress.rideTypeSection
        ? 'rideTypeSection'
        : 'rideTypeSection';
    const paymentView=Boolean((bookingSubmitted||bookingSubmissionPending)&&paymentSection&&!paymentSection.hidden&&(!journeyNavigationOverride||journeyNavigationOverride==='paymentSection'));
    const overrideSection=$(journeyNavigationOverride);
    const currentBookingCardId=journeyNavigationOverride&&overrideSection?.classList.contains('unlocked')?journeyNavigationOverride:(paymentView?'paymentSection':calculatedBookingCardId);
    if(currentBookingCardId===calculatedBookingCardId)journeyNavigationOverride='';
    document.body.classList.toggle('bookingRideMarketplaceView',currentBookingCardId==='rideTypeSection');
    document.body.classList.toggle('bookingReviewMapView',currentBookingCardId==='fareSummarySection'&&!paymentView);
    document.body.classList.toggle('bookingPaymentMapView',paymentView);
    if((currentBookingCardId==='rideTypeSection'||currentBookingCardId==='fareSummarySection'||paymentView)&&window.scrollY)window.scrollTo({top:0,left:0,behavior:'auto'});
    syncMapViewport();
    if(currentBookingCardId!=='rideTypeSection')document.body.classList.remove('rideSheetCollapsed');
    if(currentBookingCardId!=='rideTypeSection')document.body.classList.remove('rideSheetCollapsed');
    PROGRESSIVE_SECTIONS_ORDER.forEach((sectionId) => {
      $(sectionId)?.classList.toggle('currentBookingCard', sectionId === currentBookingCardId);
    });

    if(riderDetailsSection){
      const riderDetailsKeepOpen = expandedSections.has('riderDetailsSection');
      const shouldCollapseRiderDetails = (riderDetailsInitiallyCollapsed.has('riderDetailsSection') || riderDetailsConfirmed) && !riderDetailsKeepOpen;
      setSectionCollapsed('riderDetailsSection', shouldCollapseRiderDetails);
    }

    const reviewReady = Boolean(fareEstimateSignature && confirmedFareSignature === fareEstimateSignature);
    const finalView = Boolean(reviewReady || bookingSubmitted);
    const editingEarlierStep=Boolean(editingBookingReference&&['riderDetailsSection','pickupDropoffSection','rideTypeSection'].includes(currentBookingCardId));
    document.body.classList.toggle('bookingFinalView', finalView);
    document.body.classList.toggle('bookingReadyView', reviewReady && !bookingSubmitted && !journeyNavigationOverride && !editingBookingReference);
    if(distanceEtaSection) distanceEtaSection.hidden = !reviewReady || bookingSubmitted || editingEarlierStep;
    if($('fareSummarySection')) $('fareSummarySection').hidden = editingEarlierStep;

    if(paymentSection){
      const hasBookingReference = Boolean(String(currentBookingReference || '').trim());
      if(bookingSubmissionPending){
        paymentSection.hidden = false;
      }else if(bookingSubmitted && hasBookingReference){
        paymentSection.hidden = !paymentRequiredForBooking||Boolean(journeyNavigationOverride&&journeyNavigationOverride!=='paymentSection');
      }else if(finalView){
        paymentSection.hidden = true;
        if(!hasBookingReference){
          paymentSummary.textContent = 'Complete payment after your booking reference is created.';
          payStripeBtn.hidden = false;
          paySquareBtn.hidden = true;
          payStripeBtn.disabled = true;
          paySquareBtn.disabled = true;
          setPaymentMessage('Complete your booking to continue to payment.');
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
      const shouldHide = bookingSubmitted ? sectionId!==journeyNavigationOverride : finalView && isComplete && sectionId !== 'rideTypeSection' && sectionId!==journeyNavigationOverride;
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
        toggleCompletedSectionsBtn.textContent = showingCompleted ? 'Hide changes' : 'Make changes';
      }
    }

    finalVisibleSectionIds.forEach((sectionId) => {
      const section = $(sectionId);
      if(section) section.classList.remove('sectionHiddenInFinal');
    });

    if(submitBtn){
      submitBtn.hidden = bookingSubmitted && Boolean(String(currentBookingReference || '').trim());
      if(!bookingSubmitted) submitBtn.disabled = bookingSubmissionPending || !fareEstimateSignature;
    }
    updateNextStepGuide();
    const trackedStep = currentDraftStep();
    if(trackedStep !== lastTrackedBookingStep){
      lastTrackedBookingStep = trackedStep;
      window.nexusTrack?.('booking_step_viewed', { step: trackedStep.toLowerCase() });
    }
  }

  function updateNextStepGuide(){
    if(!nextStepGuide||!nextStepText||!nextStepAction)return;
    let targetId='riderDetailsSection',focusId='name',message='Enter and confirm the rider details.';
    if(riderDetailsConfirmed){targetId='pickupDropoffSection';focusId='pickup';message='Enter the route and appointment schedule to calculate prices.';}
    if(riderDetailsConfirmed&&destinationConfirmed){targetId='rideTypeSection';focusId='serviceChips';message='Compare the estimates and choose a Nexus ride.';}
    const rideComplete=rideChoiceConfirmed&&Boolean(normalizeService($('service')?.value)&&$('tripDate')?.value&&isPrimaryScheduleInputComplete()&&$('tripTime')?.value);
    if(riderDetailsConfirmed&&destinationConfirmed&&rideComplete){targetId='fareSummarySection';focusId='reviewFareBtn';message=fareEstimateSignature?'Review and confirm the fare estimate.':'Wait for the route and fare estimate, then review it.';}
    if(fareEstimateSignature&&confirmedFareSignature===fareEstimateSignature){targetId='submitBtn';focusId='submitBtn';message='Fare confirmed. Book the ride when you are ready.';}
    if(bookingSubmitted||bookingSubmissionPending){
      nextStepGuide.hidden=true;
      updateJourneyHeader('paymentSection','paymentSection');
      if(journeyCurrent)journeyCurrent.textContent='Confirmation';
      if(journeyNext)journeyNext.textContent='Ride details sent';
      if(journeyHeaderAction)journeyHeaderAction.hidden=true;
      return;
    }
    nextStepGuide.hidden=false;
    nextStepText.textContent=message;
    nextStepAction.dataset.target=targetId;
    nextStepAction.dataset.focus=focusId;
    nextStepAction.textContent=targetId==='submitBtn'?'Book ride':'Go';
    updateJourneyHeader(targetId,focusId);
  }

  function updateJourneyHeader(targetId,focusId){
    if(!journeyHeader||!journeyCurrent||!journeyNext)return;
    const riderReady=riderDetailsConfirmed;
    const routeReady=riderReady&&destinationConfirmed;
    const rideReady=routeReady&&rideChoiceConfirmed&&Boolean(normalizeService($('service')?.value)&&$('tripDate')?.value&&isPrimaryScheduleInputComplete()&&$('tripTime')?.value&&isTripScheduleComplete());
    const reviewReady=Boolean(fareEstimateSignature&&confirmedFareSignature===fareEstimateSignature);
    let step=1;
    if(riderReady)step=2;
    if(routeReady)step=3;
    if(rideReady)step=4;
    if(bookingSubmitted||bookingSubmissionPending)step=5;
    const labels=['Rider details','Route & schedule','Choose ride','Review','Payment & confirmation'];
    const journeyTargets=['riderDetailsSection','pickupDropoffSection','rideTypeSection','fareSummarySection','paymentSection'];
    const overrideStep=journeyTargets.indexOf(journeyNavigationOverride);
    if(overrideStep>=0)step=overrideStep+1;
    journeyCurrent.textContent=labels[step-1];
    journeyNext.textContent=step<5?labels[step]:'Finish booking';
    journeyHeader.setAttribute('aria-valuenow',String(step));
    journeyHeader.setAttribute('aria-valuetext',`Step ${step} of 5: ${labels[step-1]}`);
    if(journeyHeaderAction)journeyHeaderAction.hidden=false;
    Array.from(journeySegments?.querySelectorAll('.journeyStep')||[]).forEach((segment,index)=>{
      const targetId=journeyTargets[index];
      const target=$(targetId);
      const available=index===0||Boolean(target?.classList.contains('unlocked'))||(targetId==='paymentSection'&&!target?.hidden);
      segment.dataset.target=targetId;
      segment.setAttribute('role','button');
      segment.setAttribute('tabindex',available?'0':'-1');
      segment.setAttribute('aria-disabled',String(!available));
      segment.setAttribute('aria-label',`${labels[index]}${available?'':' unavailable'}`);
    });
    Array.from(journeySegments?.querySelectorAll('.journeyStep')||[]).forEach((segment,index)=>{segment.classList.toggle('complete',index<step-1);segment.classList.toggle('current',index===step-1);});
    if(journeyHeaderAction){journeyHeaderAction.dataset.target=targetId;journeyHeaderAction.dataset.focus=focusId;journeyHeaderAction.textContent=step===5?'Continue to booking ↓':`Continue to ${labels[step].toLowerCase()} ↓`;}
  }

  function currentDraftStep(){
    if(!riderDetailsConfirmed)return 'RIDER';
    if(!destinationConfirmed)return 'ROUTE';
    if(!rideChoiceConfirmed||!normalizeService($('service')?.value)||!$('tripDate')?.value||!isPrimaryScheduleInputComplete()||!isTripScheduleComplete())return 'RIDE';
    if(!fareEstimateSignature||confirmedFareSignature!==fareEstimateSignature)return 'REVIEW';
    return 'PAYMENT';
  }

  async function saveBookingDraft(){
    if(bookingSubmitted)return;
    const phone=formatPhone(String($('phone')?.value||''));
    if(phone.replace(/\D/g,'').length!==10)return;
    await fetch('/api/booking-drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({draftToken:bookingDraftToken,name:String($('name')?.value||'').trim(),phone,email:String($('email')?.value||'').trim(),currentStep:currentDraftStep()})}).catch(()=>{});
  }

  function scheduleBookingDraftSave(){
    if(draftSaveTimer)clearTimeout(draftSaveTimer);
    draftSaveTimer=setTimeout(saveBookingDraft,900);
  }

  function syncMapViewport(){
    if(!document.body.classList.contains('bookingRideMarketplaceView')&&!document.body.classList.contains('bookingReviewMapView')&&!document.body.classList.contains('bookingPaymentMapView'))return;
    const applyViewport=()=>{
      const headerBottom=Math.ceil(Number(journeyHeader?.getBoundingClientRect().bottom||140));
      const mapTop=headerBottom;
      document.documentElement.style.setProperty('--booking-map-top',`${mapTop}px`);
      const sheet=document.body.classList.contains('bookingRideMarketplaceView')?$('rideTypeSection'):(document.body.classList.contains('bookingPaymentMapView')?$('paymentSection'):$('fareSummarySection'));
      const sheetHeight=Math.ceil(Number(sheet?.getBoundingClientRect().height||0));
      const paymentView=document.body.classList.contains('bookingPaymentMapView');
      if(paymentView){
        const availableHeight=Math.max(260,window.innerHeight-mapTop-64);
        const mapHeight=Math.max(260,Math.min(520,availableHeight-sheetHeight+18));
        document.documentElement.style.setProperty('--booking-map-height',`${mapHeight}px`);
        document.documentElement.style.setProperty('--booking-sheet-top',`${mapTop+mapHeight-18}px`);
        const sheetTop=mapTop+mapHeight-18;
        const tabsTop=Math.min(window.innerHeight-64,sheetTop+sheetHeight);
        document.documentElement.style.setProperty('--booking-tabs-top',`${Math.max(sheetTop,tabsTop)}px`);
        document.documentElement.style.setProperty('--booking-map-bottom','auto');
      }else{
        document.documentElement.style.setProperty('--booking-map-bottom',`${Math.max(64,64+sheetHeight)}px`);
      }
    };
    applyViewport();
    window.requestAnimationFrame(applyViewport);
  }

  async function applyPatientTransportationPreferences(){
    if(sessionStorage.getItem('nexusCaretakerPlan'))return;
    if(String(currentUserRole||'').toUpperCase()!=='PATIENT'||!token())return;
    try{
      const response=await fetch('/api/patient/preferences',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json(),preferences=data.preferences||{},mobility=String(preferences.mobilityType||'AMBULATORY').toLowerCase();
      currentPatientPreferences=preferences;
      const service=mobility==='broda'?'wheelchair':mobility;
      if(CUSTOMER_ALLOWED_SERVICES.has(service))selectService(service);
      if($('pickup')&&!String($('pickup').value||'').trim()&&preferences.defaultPickup)$('pickup').value=preferences.defaultPickup;
      const needLines=[];
      if(preferences.remainsInWheelchair)needLines.push('Rider remains in wheelchair during transport.');
      if(preferences.transferAssistance)needLines.push('Transfer or boarding assistance requested.');
      if(preferences.oxygenRequired)needLines.push('Rider travels with oxygen.');
      if(preferences.accessibilityNotes)needLines.push(String(preferences.accessibilityNotes));
      if($('notes')&&!String($('notes').value||'').trim()&&needLines.length)$('notes').value=needLines.join(' ');
      const wheelchairAnswer=document.querySelector(`input[name="remainsInWheelchair"][value="${preferences.remainsInWheelchair?'yes':'no'}"]`);if(wheelchairAnswer)wheelchairAnswer.checked=true;
      setLoginMessage(`Your ${mobility.replace('_',' ')} transportation preferences were applied. You can change them for this ride.`);
      renderPatientDefaultsBanner(preferences);
      syncSectionProgressUi();
    }catch{}
  }

  function renderPatientDefaultsBanner(preferences={}){
    if(!patientDefaultsBanner||String(currentUserRole||'').toUpperCase()!=='PATIENT'){if(patientDefaultsBanner)patientDefaultsBanner.hidden=true;return}
    const name=String(currentUser?.displayName||currentUser?.name||'').trim().split(/\s+/)[0];
    const mobility=String(preferences.mobilityType||'AMBULATORY').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());
    const items=[`${mobility} transportation`];
    if(preferences.remainsInWheelchair)items.push('Remain in wheelchair');
    if(preferences.transferAssistance)items.push('Transfer assistance');
    if(preferences.oxygenRequired)items.push('Traveling with oxygen');
    if(preferences.defaultPickup)items.push('Saved pickup applied');
    if(preferences.preferredLanguage)items.push(`Language: ${preferences.preferredLanguage}`);
    if(preferences.communicationPreference)items.push(`Updates: ${String(preferences.communicationPreference).toUpperCase()}`);
    if(preferences.accessibilityNotes)items.push('Accessibility notes applied');
    if(patientDefaultsTitle)patientDefaultsTitle.textContent=`${name?`${name}, your`:'Your'} transportation preferences are ready`;
    if(patientDefaultsSummary)patientDefaultsSummary.textContent=`${mobility} is selected by default. Review the applied support below, then change anything needed for this ride.`;
    if(patientDefaultsList)patientDefaultsList.replaceChildren(...items.map(item=>Object.assign(document.createElement('span'),{textContent:item})));
    patientDefaultsBanner.hidden=false;
  }

  function bookingHasStarted(){
    return ['name','phone','email','pickup','destination'].some((id)=>String($(id)?.value||'').trim());
  }

  function hideBookingNudge(){
    if(bookingNudgeTimer)clearTimeout(bookingNudgeTimer);
    bookingNudgeTimer=null;
    if(bookingNudge)bookingNudge.hidden=true;
  }

  function scheduleBookingNudge(){
    hideBookingNudge();
    if(bookingSubmitted||!bookingHasStarted()||sessionStorage.getItem('nexusBookingNudgeDismissed')==='1')return;
    bookingNudgeTimer=setTimeout(()=>{
      if(!bookingSubmitted&&bookingHasStarted()&&!document.hidden&&document.body.dataset.activeTab==='book')bookingNudge.hidden=false;
    },90000);
  }

  function bindBookingNudge(){
    bookingNudgeContinue?.addEventListener('click',()=>{
      hideBookingNudge();
      nextStepAction?.click();
      scheduleBookingNudge();
    });
    bookingNudgeDismiss?.addEventListener('click',()=>{
      hideBookingNudge();
      sessionStorage.setItem('nexusBookingNudgeDismissed','1');
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleBookingNudge();});
  }

  function completeBookingDraft(){
    if(draftSaveTimer)clearTimeout(draftSaveTimer);
    return fetch(`/api/booking-drafts/${encodeURIComponent(bookingDraftToken)}/complete`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>{});
  }

  function buildFareEstimateSignature(){
    return [normalizeService($('service')?.value),String($('pickup')?.value||'').trim(),getRouteDestinations().join('|'),String($('tripDate')?.value||''),String(tripType?.value||''),String(returnTripDate?.value||''),String(returnTripTime?.value||''),getLegAppointments().map((item) => item.appointmentTime).join('|'),getStopWaitMinutes().join('|'),Number(estimateState.fare||0).toFixed(2),Number(estimateState.miles||0).toFixed(2)].join('::');
  }

  function updateFareConfirmationState(){
    const next=Number(estimateState.fare||0)>0&&Number(estimateState.miles||0)>0?buildFareEstimateSignature():'';
    if(next!==fareEstimateSignature){
      fareEstimateSignature=next;
      confirmedFareSignature='';
      fareSubmissionAuthorized=false;
    }
    if(submitBtn&&!bookingSubmitted)submitBtn.disabled=!fareEstimateSignature;
  }

  function promptFareConfirmation(force = false){
    updateFareConfirmationState();
    if(!fareEstimateSignature||(!force&&confirmedFareSignature===fareEstimateSignature)||(!force&&lastPromptedFareSignature===fareEstimateSignature))return;
    if(!getProgressState().allRequiredComplete||!destinationConfirmed)return;
    lastPromptedFareSignature=fareEstimateSignature;
    if(fareConfirmAmount)fareConfirmAmount.textContent=`$${Number(estimateState.fare||0).toFixed(2)}`;
    if(fareConfirmDetails)fareConfirmDetails.textContent=`${Number(estimateState.miles||0).toFixed(1)} miles • ${estimateState.durationText||'Estimated travel time pending'}`;
    if(fareConfirmDialog?.showModal)fareConfirmDialog.showModal();
  }

  function reopenFareConfirmation(){
    updateFareConfirmationState();
    if(!fareEstimateSignature){
      setStatus('Complete the route and schedule so a fare can be estimated first.', 'err');
      updateNextStepGuide();
      return;
    }
    lastPromptedFareSignature='';
    promptFareConfirmation(true);
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

    ['tripDate', 'appointmentTime', 'tripTime', 'name', 'phone', 'email', 'notes'].forEach((id) => {
      const field = $(id);
      if(!field) return;
      ['change', 'input', 'blur'].forEach((eventName) => {
        field.addEventListener(eventName, () => {
          if(id === 'appointmentTime'||(id==='tripTime'&&isPickupTimeBasis())){
            applyScheduleTimeCalculation();
            refreshFareForMembership();
            renderMultiStopFeasibility();
          }
          if(id === 'tripDate') refreshFareForMembership();
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
    scheduleBasisInput?.addEventListener('change',syncScheduleBasisUi);
    syncScheduleBasisUi();

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
    if(String(payerType?.value||'').toUpperCase()==='INSURANCE'&&!String(insuranceCarrier?.value||'').trim()){
      setStatus('Select the private insurance provider, then confirm details.', 'err');
      riderDetailsConfirmed=false;
      if(insuranceCarrierField) insuranceCarrierField.hidden=false;
      if(insuranceCarrier) insuranceCarrier.required=true;
      insuranceCarrierField?.scrollIntoView({behavior:'smooth',block:'center'});
      insuranceCarrier?.focus();
      syncSectionProgressUi();
      return;
    }
    riderDetailsConfirmed = true;
    journeyNavigationOverride='';
    expandedSections.delete('riderDetailsSection');
    setStatus('Rider details confirmed.', 'ok');
    syncSectionProgressUi();
    window.requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
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
    telemetryRouteHint.textContent = 'Route preview appears once pickup and destination are entered.';
    if(!telemetryMap){
      Promise.resolve(resolveFallbackRoutePoints()).then((routePoints) => {
        renderTelemetryFallback(lastTelemetryVehicles, lastTelemetryUsingLocalMock, routePoints);
      }).catch(() => {});
    }
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
    const normalizedStops = stops.length >= 2 ? stops : [
      'Medical Center, Maryland',
      'Hospital Campus, Maryland'
    ];
    const points = await Promise.all(normalizedStops.map((stop, index) => lookupLocationPoint(stop).then((point) => {
      if(point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) return point;
      return syntheticRoutePoint(stop, index, normalizedStops.length);
    })));
    return points;
  }

  async function estimateFallbackRoute(pickupOrStops, destination, waypointStops = [], travelMinutes = []){
    const stops = Array.isArray(pickupOrStops)
      ? pickupOrStops
      : [pickupOrStops, ...(Array.isArray(waypointStops) ? waypointStops : []), destination].filter(Boolean);
    if(stops.length < 2) return null;
    let totalMiles = 0;
    for(let index = 0; index < stops.length - 1; index += 1){
      let [origin, target] = await Promise.all([
        lookupLocationPoint(stops[index]),
        lookupLocationPoint(stops[index + 1])
      ]);
      let straightMiles = haversineMiles(origin, target);
      if(!straightMiles){
        origin = syntheticRoutePoint(stops[index], index, stops.length);
        target = syntheticRoutePoint(stops[index + 1], index + 1, stops.length);
        straightMiles = haversineMiles(origin, target);
      }
      if(!straightMiles) return null;
      const legMiles = Math.max(1, straightMiles * 1.18);
      totalMiles += legMiles;
      travelMinutes.push(Math.max(15, Math.round((legMiles / 25) * 60)));
    }
    return totalMiles;
  }

  function debounce(fn, waitMs){
    let timer = null;
    const debounced = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
    debounced.cancel = () => clearTimeout(timer);
    return debounced;
  }

  function normalizeService(value){
    const raw = String(value || '').trim().toLowerCase();
    if(!raw) return '';
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

  function calculateFareBreakdown(service,miles,dateStr,timeStr,routeMetrics={}){
    let pickupTime=timeStr;
    if(typeof appointmentTimeInput!=='undefined'&&appointmentTimeInput?.value&&!isPickupTimeBasis()){
      const firstLeg=Math.ceil(Number(routeLegTravelMinutes[0]||Math.max(routeMetrics.durationMinutes||0,routeMetrics.trafficDurationMinutes||0)));
      if(firstLeg>0)pickupTime=minutesToTime(parseTimeToMinutes(appointmentTimeInput.value)-firstLeg-15);
    }
    return NexusFare.calculate({service,miles,date:dateStr,time:pickupTime,rate:getPricing(service),rules:fareRules,
      tripType:tripType?.value,returnDate:returnTripDate?.value,returnTime:returnTripTime?.value,
      waitMinutes:getWaitingCharge(service,routeMetrics).waitMinutes||0,
      metrics:{...routeMetrics,deadheadSegments:routeMetrics.deadheadSegments||[deadheadRouteMiles.toPickup,String(tripType?.value).toUpperCase()==='ROUND_TRIP'?deadheadRouteMiles.fromReturn:deadheadRouteMiles.fromDestination]}});
  }

  function calculateFare(service, miles, dateStr, timeStr, routeMetrics = {}){
    return calculateFareBreakdown(service, miles, dateStr, timeStr, routeMetrics).total;
  }

  function resolveFareTimeForEstimate(){
    const pickupEstimate = String($('tripTime')?.value || '').trim();
    if(pickupEstimate) return pickupEstimate;
    const appointmentTime = String(appointmentTimeInput?.value || '').trim();
    if(appointmentTime) return appointmentTime;
    return '12:00';
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
      if(data?.organization && typeof data.organization === 'object'){
        const yardAddress = String(data.organization.yardAddress || '').trim();
        companyYardAddress = yardAddress || DEFAULT_YARD_ADDRESS;
        const preTrip = Number(data.organization.preTripInspectionMinutes);
        preTripInspectionMinutes = Number.isFinite(preTrip) ? Math.max(0, Math.min(180, preTrip)) : DEFAULT_PRETRIP_INSPECTION_MINUTES;
      }
    }catch{}
  }

  function resolveRouteDepartureTime(tripDate, appointmentTime){
    const date = String(tripDate || '').trim();
    const time = String(appointmentTime || '').trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)){
      const local = new Date(`${date}T${time}:00`);
      if(!Number.isNaN(local.getTime())) return local;
    }
    return new Date();
  }

  async function estimateYardToPickupRoute(pickup, tripDate, appointmentTime, origin = companyYardAddress){
    if(!pickup || !companyYardAddress) return { minutes: 0, trafficMinutes: 0 };
    try{
      await loadMaps();
      const dirSvc = new google.maps.DirectionsService();
      const departureTime = resolveRouteDepartureTime(tripDate, appointmentTime);
      const result = await new Promise((resolve, reject) => {
        dirSvc.route({
          origin,
          destination: pickup,
          travelMode: google.maps.TravelMode.DRIVING,
          drivingOptions: { departureTime, trafficModel: google.maps.TrafficModel.BEST_GUESS },
          unitSystem: google.maps.UnitSystem.IMPERIAL
        }, (res, status) => status === 'OK' ? resolve(res) : reject(new Error(status)));
      });
      const legs = result.routes?.[0]?.legs || [];
      const minutes = legs.reduce((sum, leg) => sum + (Number(leg?.duration?.value || 0) / 60), 0);
      const trafficMinutes = legs.reduce((sum, leg) => sum + (Number(leg?.duration_in_traffic?.value || leg?.duration?.value || 0) / 60), 0);
      return {
        miles: legs.reduce((sum, leg) => sum + Number(leg?.distance?.value || 0) / 1609.34, 0),
        minutes: Math.max(0, Math.round(minutes)),
        trafficMinutes: Math.max(0, Math.round(trafficMinutes || minutes))
      };
    }catch{
      const [start, end] = await Promise.all([lookupLocationPoint(origin), lookupLocationPoint(pickup)]);
      const miles = haversineMiles(start, end) * 1.18;
      return { miles:Math.max(0, miles || 0), minutes:0, trafficMinutes:0 };
    }
  }

  async function estimateDeadheadMiles(pickup, destination, date, time){
    const routes = await Promise.all([
      estimateYardToPickupRoute(pickup, date, time),
      estimateYardToPickupRoute(companyYardAddress, date, time, destination),
      estimateYardToPickupRoute(companyYardAddress, date, time, pickup)
    ]);
    return { toPickup:Number(routes[0].miles || 0), fromDestination:Number(routes[1].miles || 0), fromReturn:Number(routes[2].miles || 0) };
  }

  async function loadIntegrationConfig(){
    try{
      const r = await fetch('/api/integrations/config', { cache: 'no-store' });
      if(!r.ok) return;
      const cfg = await r.json();
      mapsEnabled = !!cfg.googleMapsEnabled;
      mapsBrowserKey = String(cfg.googleMapsBrowserKey || '').trim();
      stripeEnabled = !!cfg.stripeEnabled;
      previewPaymentsEnabled = cfg.testMode === true;
      squareEnabled = !!cfg.squareEnabled;
      if(cfg.testMode && !document.getElementById('testModeBanner')){
        const banner=document.createElement('div');
        banner.id='testModeBanner';
        banner.setAttribute('role','status');
        banner.textContent='TEST MODE — bookings and payments are simulated';
        banner.style.cssText='position:sticky;top:0;z-index:10000;padding:9px 12px;background:#fff3cd;color:#5f4500;border-bottom:1px solid #e6c65c;text-align:center;font:800 12px/1.3 Sora,sans-serif;letter-spacing:.03em';
        document.body.prepend(banner);
        document.body.classList.add('nexusTestMode');
      }

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
    // Deposit/full choices select the configured provider; do not render a third legacy provider button.
    if(payStripeBtn) payStripeBtn.hidden = true;
    if(paySquareBtn) paySquareBtn.hidden = true;
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
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        reject(new Error('Google Maps took too long to load.'));
      }, 8000);
      script.onload = () => {
        window.clearTimeout(timeout);
        resolve();
        if(timedOut && window.google?.maps?.Map){
          mapsReadyPromise = Promise.resolve();
          wireGoogleAutocomplete();
          void initTelemetry().then(() => {
            if(destinationConfirmed && !confirmedFareSignature && !bookingSubmitted && !bookingSubmissionPending){
              return estimateRouteAndFare({promptConfirmation:false});
            }
          }).catch(() => {});
        }
      };
      script.onerror = () => { window.clearTimeout(timeout); reject(new Error('Could not load Google Maps.')); };
      document.head.appendChild(script);
    });
    return mapsReadyPromise;
  }

  function resetEstimateUi(){
    estimateState = { miles: 0, durationText: '', durationMinutes: 0, trafficDurationMinutes: 0, subtotal: 0, taxAmount: 0, preDiscountFare: 0, memberSavings: 0, discountPct: 0, fare: 0 };
    estMiles.textContent = '-';
    if($('estWaitRow')) $('estWaitRow').hidden=true;
    if($('estPremiumRow')) $('estPremiumRow').hidden=true;
    ['fareSummaryMileage','fareConfirmMileage'].forEach(id=>{ if($(id)) $(id).hidden=true; });
    ['fareSummaryPremium','fareConfirmPremium'].forEach(id=>{ if($(id)) $(id).hidden=true; });
    ['fareSummaryWaiting','fareConfirmWaiting'].forEach(id=>{ if($(id)) $(id).hidden=true; });
    estDuration.textContent = '-';
    if(estSubtotal) estSubtotal.textContent = '-';
    if(estTax) estTax.textContent = '-';
    if(estMemberSavingsRow) estMemberSavingsRow.hidden = true;
    if(estMemberSavings) estMemberSavings.textContent = '-';
    estFare.textContent = '-';
    if(fareMemberSavingsRow) fareMemberSavingsRow.hidden = true;
    if(fareMemberSavings) fareMemberSavings.textContent = '-';
    updateTripScheduleSavingsMessage();
    if(memberDiscountNote) memberDiscountNote.textContent = '';
    if($('tripTime')) $('tripTime').value = '';
    clearCustomerRoute();
  }

  function parseTimeToMinutes(value){
    const raw = String(value || '').trim();
    if(!/^\d{2}:\d{2}$/.test(raw)) return null;
    const [hh, mm] = raw.split(':').map((part) => Number(part));
    if(!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return (hh * 60) + mm;
  }

  function minutesToTime(totalMinutes){
    const normalized = Math.max(0, Math.min((24 * 60) - 1, Number(totalMinutes) || 0));
    const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
    const mm = String(normalized % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function getEstimatedRouteMinutes(){
    if(isMultipleStopsEnabled() && routeLegTravelMinutes[0] > 0) return Number(routeLegTravelMinutes[0]);
    const traffic = Math.max(0, Number(estimateState.trafficDurationMinutes || 0));
    const scheduled = Math.max(0, Number(estimateState.durationMinutes || 0));
    return Math.max(traffic, scheduled);
  }

  function getDriverYardReportTime(){
    const pickupMinutes = parseTimeToMinutes($('tripTime')?.value || '');
    if(pickupMinutes == null) return '';
    const yardTravel = Math.max(0, Number(yardToPickupTrafficDurationMinutes || yardToPickupDurationMinutes || 0));
    const reportMinutes = pickupMinutes - Math.ceil(yardTravel) - Math.max(0, Number(preTripInspectionMinutes || 0));
    return minutesToTime(reportMinutes);
  }

  function applyPickupEstimateFromAppointment(){
    if(!appointmentTimeInput || !$('tripTime')) return;
    const appointmentMinutes = parseTimeToMinutes(appointmentTimeInput.value);
    if(appointmentMinutes == null){
      $('tripTime').value = '';
      syncSectionProgressUi();
      return;
    }
    const routeMinutes = getEstimatedRouteMinutes();
    if(!routeMinutes){
      $('tripTime').value = '';
      syncSectionProgressUi();
      return;
    }

    const dispatchBufferMinutes = 15;
    const pickupMinutes = appointmentMinutes - Math.ceil(routeMinutes) - dispatchBufferMinutes;
    $('tripTime').value = minutesToTime(pickupMinutes);
    syncSectionProgressUi();
  }

  function isPickupTimeBasis(){return String(scheduleBasisInput?.value||'APPOINTMENT').toUpperCase()==='PICKUP'&&!isMultipleStopsEnabled();}
  function applyAppointmentEstimateFromPickup(){
    if(!appointmentTimeInput||!$('tripTime'))return;
    const pickupMinutes=parseTimeToMinutes($('tripTime').value),routeMinutes=getEstimatedRouteMinutes();
    if(pickupMinutes==null||!routeMinutes){appointmentTimeInput.value='';return;}
    appointmentTimeInput.value=minutesToTime(pickupMinutes+Math.ceil(routeMinutes)+15);
  }
  function applyScheduleTimeCalculation(){if(isPickupTimeBasis())applyAppointmentEstimateFromPickup();else applyPickupEstimateFromAppointment();syncCalculatedWaitingUi();}
  function syncScheduleBasisUi(){
    const pickupBasis=isPickupTimeBasis();
    if(appointmentTimeInput){appointmentTimeInput.readOnly=pickupBasis;appointmentTimeInput.required=!pickupBasis;appointmentTimeInput.classList.toggle('systemGeneratedField',pickupBasis);}
    if($('tripTime')){$('tripTime').readOnly=!pickupBasis;$('tripTime').classList.toggle('systemGeneratedField',!pickupBasis);}
    if(appointmentTimeLabel)appointmentTimeLabel.textContent=pickupBasis?'Estimated Arrival Time':'Appointment Time';
    if($('pickupTimeSystemHint'))$('pickupTimeSystemHint').textContent=pickupBasis?'Enter the time the patient should be picked up.':'Calculated from the route and appointment time.';
    applyScheduleTimeCalculation();syncSectionProgressUi();
  }
  function isPrimaryScheduleInputComplete(){return isMultipleStopsEnabled()?areLegAppointmentTimesComplete():(isPickupTimeBasis()?Boolean($('tripTime')?.value):Boolean(appointmentTimeInput?.value));}

  function hidePaymentOptions(){
    currentBookingReference = '';
    currentBookingFare = 0;
    bookingSubmitted = false;
    paymentRequiredForBooking = false;
    if(paymentSection) paymentSection.hidden = true;
    setPaymentMessage('');
    if(submitBtn){
      submitBtn.textContent = 'Book My Ride';
      submitBtn.hidden = false;
    }
  }

  function expandPaymentOptions(){
    document.body.classList.remove('paymentSheetCollapsed');
    $('paymentSheetHandle')?.setAttribute('aria-expanded', 'true');
    $('paymentSheetHandle')?.setAttribute('aria-label', 'Collapse payment options');
  }

  function showPaymentOptions(reference, fare, requiresOnlinePayment = true){
    currentBookingReference = String(reference || '').trim();
    currentBookingFare = Number(fare || 0);
    paymentRequiredForBooking = Boolean(requiresOnlinePayment);
    if(!paymentSection || !currentBookingReference) return;
    // Bookings configured for delayed or invoice-based billing do not show immediate checkout.
    if(!requiresOnlinePayment){
      paymentSection.hidden = true;
      if(paymentSummary) paymentSummary.textContent = 'A secure payment link will be sent before pickup, or an invoice will be sent for facility billing.';
      setPaymentMessage('No action is needed right now.');
      return;
    }
    paymentSection.hidden = false;
    expandPaymentOptions();
    paymentSection.querySelector('h2').textContent='Complete Payment';
    if(paymentChoiceHint)paymentChoiceHint.hidden=false;
    const depositAmt = Math.round(Math.round(currentBookingFare * 100) / 4) / 100;
    const taxRatePct = CARD_PROCESSING_FEE_PCT;
    const discountText = estimateState.memberSavings > 0
      ? ` Includes ${estimateState.discountPct}% ${token()?'member':'schedule'} savings of $${estimateState.memberSavings.toFixed(2)}.`
      : ' Guest fare shown. Sign in to save 5% on one-way or 10% on round-trip and recurring rides.';
    if(taxRatePct > 0){
      const inferredSubtotal = currentBookingFare / (1 + (taxRatePct / 100));
      const inferredTax = Math.max(0, currentBookingFare - inferredSubtotal);
      paymentSummary.textContent = `Booking ${currentBookingReference} is ready for payment. Estimated total: $${currentBookingFare.toFixed(2)} (fare $${inferredSubtotal.toFixed(2)} + card processing fee $${inferredTax.toFixed(2)} at ${taxRatePct.toFixed(0)}%).${discountText}`;
    }else{
      paymentSummary.textContent = `Booking ${currentBookingReference} is ready for payment. Estimated total: $${currentBookingFare.toFixed(2)}.${discountText}`;
    }
    // Populate deposit / full labels
    if(depositAmountLabel) depositAmountLabel.textContent = `$${depositAmt.toFixed(2)}`;
    if(fullAmountLabel) fullAmountLabel.textContent = `$${currentBookingFare.toFixed(2)}`;
    // Show deposit/full buttons; hide legacy single-provider buttons
    if(payDepositBtn){ payDepositBtn.hidden = false; payDepositBtn.disabled = !(stripeEnabled || squareEnabled); }
    if(payFullBtn){ payFullBtn.hidden = false; payFullBtn.disabled = !(stripeEnabled || squareEnabled); }
    if(payStripeBtn) payStripeBtn.hidden = true;
    if(paySquareBtn) paySquareBtn.hidden = true;
    updatePaymentButtonState();
    if(payStripeBtn) payStripeBtn.hidden = true;
    if(paySquareBtn) paySquareBtn.hidden = true;
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
    if(bookingSubmissionPending) return;
    if(!currentBookingReference){
      setPaymentMessage('Create a booking before starting payment.', true);
      return;
    }
    const resolvedProvider = resolvePaymentProvider(provider);
    if(!resolvedProvider){
      setPaymentMessage('Online payment is temporarily unavailable. Please call us at (888) 760-4990 for help.', true);
      return;
    }
    const mode = ['deposit','full'].includes(paymentMode) ? paymentMode : 'full';
    const button = mode === 'deposit' ? payDepositBtn : payFullBtn;
    const idleText = mode === 'deposit'
      ? `Pay 25% Deposit — $${(Math.round(Math.round(currentBookingFare * 100) / 4) / 100).toFixed(2)}`
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
      try{sessionStorage.setItem('nexusCheckoutBooking',JSON.stringify({reference:currentBookingReference,fare:currentBookingFare,phone:String($('phone')?.value||managePhone?.value||'')}));}catch{}
      window.location.href = data.url;
    }catch(err){
      setPaymentMessage(err.message, true);
      setBusy(button, false, busyText, idleText);
      return;
    }
  }

  async function restoreCheckoutBooking(){
    const params=new URLSearchParams(window.location.search);
    const result=params.get('payment'),reference=params.get('bookingReference');
    if(!['success','cancelled'].includes(result)||!reference)return;
    let saved;
    try{saved=JSON.parse(sessionStorage.getItem('nexusCheckoutBooking')||'null');}catch{}
    if(manageReference)manageReference.value=reference;
    if(saved?.reference!==reference||!saved.phone){
      if(manageTripPanel)manageTripPanel.hidden=false;
      setManageTripMessage('Enter the phone used for this booking and choose Find Trip to verify its status.');
      return;
    }
    if(managePhone)managePhone.value=saved.phone;
    try{
      let booking;
      if(previewPaymentsEnabled){
        // Preview bookings are deliberately not persisted. Never use this receipt in production.
        let receipt;
        try{receipt=JSON.parse(sessionStorage.getItem('nexusPreviewPayment')||'null');}catch{}
        booking={reference,estimatedFare:Number(saved.fare||0),status:'pending-payment',paymentStatus:receipt?.reference===reference?receipt.paymentStatus:'UNPAID'};
      }else{
        const response=await fetch(`/api/bookings/${encodeURIComponent(reference)}?phone=${encodeURIComponent(saved.phone)}`,{cache:'no-store'});
        const data=await response.json();
        if(!response.ok||!data.booking)throw new Error(data.error||'Unable to verify payment status.');
        booking=data.booking;
      }
      const paid=['DEPOSIT_PAID','PAID_IN_FULL'].includes(String(booking.paymentStatus||'').toUpperCase());
      const cancelled=String(booking.status||'').toUpperCase()==='CANCELLED';
      bookingSubmitted=true;
      journeyNavigationOverride='';
      if($('phone'))$('phone').value=saved.phone;
      showPaymentOptions(reference,Number(booking.estimatedFare||0),true);
      syncSectionProgressUi();
      if(paid||cancelled||result==='success'){
        paymentSection.querySelector('h2').textContent='Payment status';
        [payDepositBtn,payFullBtn,payStripeBtn,paySquareBtn].forEach(button=>{if(button)button.hidden=true;});
        if(paymentChoiceHint)paymentChoiceHint.hidden=true;
        const message=cancelled?'This booking has been cancelled.':paid
          ?(booking.paymentStatus==='DEPOSIT_PAID'?'Your deposit has been received.':'Your payment has been received in full.')
          :'Your payment is still being confirmed. Refresh this page to check its status. Please do not pay again.';
        paymentSummary.textContent=`Booking ${reference}. ${message}`;
        setPaymentMessage(paid?(previewPaymentsEnabled?'Test payment verified. No card was charged.':'Payment verified with Nexus.'):cancelled?'No payment is required.':'Awaiting payment confirmation.');
      }else{
        setPaymentMessage('Checkout was cancelled. Choose a payment option to try again for this same booking.');
      }
    }catch(error){
      if(manageTripPanel)manageTripPanel.hidden=false;
      setManageTripMessage(`${error.message} Use Find Trip to try again.`,true);
    }
  }

  function clearCustomerRoute(){
    if(customerRoutePolyline) customerRoutePolyline.setMap(null);
    if(customerPickupMarker) customerPickupMarker.setMap(null);
    if(customerDestinationMarker) customerDestinationMarker.setMap(null);
    customerIntermediateStopMarkers.forEach((marker) => marker.setMap(null));
    customerRoutePolyline = null;
    customerPickupMarker = null;
    customerDestinationMarker = null;
    customerIntermediateStopMarkers = [];
    customerRouteBounds = null;
    applyFocusMode();
  }

  window.NexusBookingApp = {
    showPaymentOptions,
    startHostedPayment
  };

  function renderTelemetryFallback(vehicles = [], usingLocalMock = false, routePoints = []){
    // A location lookup started before map initialization may finish afterward.
    if(!telemetryMapEl || telemetryMap) return;
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
    telemetryMapEl.innerHTML = `
      <div class="telemetryFallbackMap" aria-label="Nexus Route Pulse map">
        <div class="telemetryFallbackOverlay">
          <span class="telemetryFallbackBadge">Nexus Route Pulse</span>
          <span class="telemetryFallbackBadge">${points.length ? 'Service nearby' : 'Route preview'}</span>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Planned ride map">
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
      </div>
    `;
    if(telemetryList){
      telemetryList.innerHTML = '';
      telemetryList.hidden = true;
    }
    if(telemetryStatus){
      telemetryStatus.hidden = false;
      telemetryStatus.textContent = `Route Pulse updated ${new Date().toLocaleTimeString()}`;
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

  function renderCustomerRoute(result, pickupLabel, destinationLabels){
    if(!telemetryMap || !result?.routes?.[0]) return;
    if(customerRoutePolyline) customerRoutePolyline.setMap(null);
    if(customerPickupMarker) customerPickupMarker.setMap(null);
    if(customerDestinationMarker) customerDestinationMarker.setMap(null);
    customerIntermediateStopMarkers.forEach((marker) => marker.setMap(null));
    customerIntermediateStopMarkers = [];

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
    const destinations = Array.isArray(destinationLabels) ? destinationLabels : [destinationLabels];
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1] || firstLeg;
    const start = firstLeg?.start_location;
    const end = lastLeg?.end_location;
    if(start){
      customerPickupMarker = new google.maps.Marker({
        map: telemetryMap,
        position: start,
        title: `Pickup: ${pickupLabel}`,
        label: { text: `Pickup: ${pickupLabel}`, color: '#0b3d2f', fontWeight: '700', className: 'routeAddressMarkerLabel routeAddressMarkerLabelPickup' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#0b7a5a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 9,
          labelOrigin: new google.maps.Point(0, -3)
        },
        zIndex: 700
      });
    }
    legs.slice(0, -1).forEach((leg, index) => {
      const position = leg?.end_location;
      const address = String(destinations[index] || leg?.end_address || `Stop ${index + 1}`).trim();
      if(!position) return;
      customerIntermediateStopMarkers.push(new google.maps.Marker({
        map: telemetryMap,
        position,
        title: `Stop ${index + 1}: ${address}`,
        label: { text: `Stop ${index + 1}: ${address}`, color: '#58410a', fontWeight: '700', className: 'routeAddressMarkerLabel routeAddressMarkerLabelStop' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#d99a16',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8,
          labelOrigin: new google.maps.Point(0, -3)
        },
        zIndex: 710 + index
      }));
    });
    if(end){
      const destinationLabel = String(destinations[destinations.length - 1] || lastLeg?.end_address || 'Destination').trim();
      customerDestinationMarker = new google.maps.Marker({
        map: telemetryMap,
        position: end,
        title: `Destination: ${destinationLabel}`,
        label: { text: `Destination: ${destinationLabel}`, color: '#12364c', fontWeight: '700', className: 'routeAddressMarkerLabel routeAddressMarkerLabelDestination' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#0c4a6e',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 9,
          labelOrigin: new google.maps.Point(0, -3)
        },
        zIndex: 700
      });
    }

    customerRouteBounds = buildRouteBounds(result);
    applyFocusMode();
    fitCombinedViewport();
  }

  function renderRateEditor(service){
    const taxHint = ` A ${CARD_PROCESSING_FEE_PCT}% card processing fee is included.`;
    const selectedService = normalizeService(service);
    if(!isAdminUser){
      rateBase.value = '';
      rateIncluded.value = '';
      ratePerMile.value = '';
      rateWait.value = '';
      if(selectedService){
        rateSourceLabel.textContent = `Fare estimate is calculated automatically.${taxHint}`;
      }else{
        rateSourceLabel.textContent = 'Select a ride type to calculate an estimate.';
      }
      return;
    }
    const svc = selectedService;
    if(!svc){
      rateBase.value = '';
      rateIncluded.value = '';
      ratePerMile.value = '';
      rateWait.value = '';
      rateSourceLabel.textContent = 'Select a ride type to view and edit rate settings.';
      return;
    }
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
        pickupAutocomplete = new google.maps.places.Autocomplete($('pickup'), {
          fields:['formatted_address','geometry','place_id','name'],
          componentRestrictions:{country:'us'},
          types:['geocode','establishment']
        });
        pickupAutocomplete.addListener('place_changed', () => {
          const place = pickupAutocomplete.getPlace();
          if(place?.formatted_address || place?.name) $('pickup').value = place.formatted_address || place.name;
          clearFlightLookup();
          resetEstimateUi();
        });
      }
      if(!destinationAutocomplete){
        destinationAutocomplete = new google.maps.places.Autocomplete($('destination'), {
          fields:['formatted_address','geometry','place_id','name'],
          componentRestrictions:{country:'us'},
          types:['geocode','establishment']
        });
        destinationAutocomplete.addListener('place_changed', () => {
          const place = destinationAutocomplete.getPlace();
          if(place?.formatted_address || place?.name) $('destination').value = place.formatted_address || place.name;
          clearFlightLookup();
          resetEstimateUi();
        });
      }
      return true;
    }catch{
      return false;
    }
  }

  function clearFlightLookup(clearTerminal=true){
    selectedFlightInfo = null;
    const result = $('flightTerminalResult');
    const confirmationRow = $('flightAirportConfirmRow');
    const confirmation = $('flightAirportConfirmed');
    if(result){ result.hidden = true; result.textContent = ''; }
    if(confirmationRow) confirmationRow.hidden = true;
    if(confirmation) confirmation.checked = false;
    if($('flightLookupStatus')) $('flightLookupStatus').textContent = '';
    if(clearTerminal && $('flightTerminalInput')) $('flightTerminalInput').value = '';
  }

  function getFlightDetailsPayload(){
    const flightNumber = String($('flightNumber')?.value || '').trim().toUpperCase();
    const terminal = String($('flightTerminalInput')?.value || '').trim();
    if(!flightNumber && !terminal) return null;
    const airportStop = String($('flightAirportStop')?.value || 'PICKUP').toUpperCase();
    const destinations = getRouteDestinations();
    const airportName = airportStop === 'PICKUP' ? $('pickup')?.value.trim() : (destinations[destinations.length - 1] || '');
    return {
      flightNumber,
      date: String($('tripDate')?.value || ''),
      airportStop,
      movement: selectedFlightInfo?.movement || (airportStop === 'PICKUP' ? 'ARRIVAL' : 'DEPARTURE'),
      airportName,
      airport: selectedFlightInfo?.airport || null,
      terminal: terminal || null,
      terminalSource: selectedFlightInfo && terminal === String(selectedFlightInfo.terminal || '') ? 'FLIGHTAWARE' : 'MANUAL',
      gate: selectedFlightInfo?.gate || null,
      scheduledTime: selectedFlightInfo?.scheduledTime || null,
      status: selectedFlightInfo?.status || null,
      origin: selectedFlightInfo?.origin || null,
      destination: selectedFlightInfo?.destination || null
    };
  }

  async function lookupFlightTerminal(){
    const flightNumber = String($('flightNumber')?.value || '').trim();
    const date = String($('tripDate')?.value || '').trim();
    const airportStop = String($('flightAirportStop')?.value || 'PICKUP').toUpperCase();
    const lookupButton = $('lookupFlightBtn');
    const status = $('flightLookupStatus');
    const result = $('flightTerminalResult');
    if(!flightNumber){ if(status) status.textContent = 'Enter the airline flight number first.'; return; }
    if(!date){ if(status) status.textContent = 'Choose the ride date, then look up the flight.'; return; }
    clearFlightLookup();
    if(lookupButton) lookupButton.disabled = true;
    if(status) status.textContent = 'Checking the flight and airport terminal...';
    try{
      const response = await fetch('/api/flights/lookup', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({flightNumber,date,airportStop})
      });
      const data = await response.json().catch(()=>({}));
      if(!response.ok || !data.flight) throw new Error(data.error || 'Flight lookup did not return a match.');
      selectedFlightInfo = data.flight;
      const flight = data.flight;
      const route = [flight.origin?.code || flight.origin?.name, flight.destination?.code || flight.destination?.name].filter(Boolean).join(' to ');
      const airport = [flight.airport?.name,flight.airport?.code ? `(${flight.airport.code})` : ''].filter(Boolean).join(' ');
      const terminal = flight.terminal ? `Terminal ${flight.terminal}` : 'Terminal not reported';
      const gate = flight.gate ? `, gate ${flight.gate}` : '';
      const scheduled = flight.scheduledTime ? `, scheduled ${new Date(flight.scheduledTime).toLocaleString()}` : '';
      if(result){
        result.textContent = `${flight.flightNumber} ${flight.movement.toLowerCase()} at ${airport || 'the airport in the flight record'}: ${terminal}${gate}${scheduled}. Route: ${route || 'not provided'}.`;
        result.hidden = false;
      }
      if($('flightTerminalInput')) $('flightTerminalInput').value = flight.terminal || '';
      if($('flightAirportConfirmRow')) $('flightAirportConfirmRow').hidden = false;
      if(status) status.textContent = 'Verify the airport and route above before confirming this flight for the trip.';
    }catch(error){
      if(status) status.textContent = String(error.message || 'Flight lookup failed. You can still enter a terminal manually.');
    }finally{
      if(lookupButton) lookupButton.disabled = false;
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
        clearFlightLookup();
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
        clearFlightLookup();
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
        clearFlightLookup();
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

  async function estimateRouteAndFare(options={}){
    const estimateVersion=++routeEstimateVersion;
    const shouldPromptConfirmation=options.promptConfirmation!==false;
    clearStatus();

    const pickup = $('pickup').value.trim();
    const destinations = getRouteDestinations();
    const destination = destinations[destinations.length - 1] || '';
    const service = normalizeService($('service').value);
    const tripDate = $('tripDate').value;
    const fareTime = resolveFareTimeForEstimate();

    if(!service){
      setStatus('Select a ride type before estimating fare.', 'err');
      syncSectionProgressUi();
      return estimateState;
    }

    if(!pickup || !destination){
      markDestinationUnconfirmed();
      const breakdown = calculateFareBreakdown(service, 0, tripDate, fareTime, { durationMinutes: 0, trafficDurationMinutes: 0 });
      renderFareEstimateBreakdown(breakdown, 0, '-', 0, 0);
      setStatus('Enter pickup and destination stops to estimate route miles.', 'err');
      syncSectionProgressUi();
      return estimateState;
    }

    let miles = 0;
    let durationText = '';
    let durationMinutes = 0;
    let trafficDurationMinutes = 0;
    yardToPickupDurationMinutes = 0;
    yardToPickupTrafficDurationMinutes = 0;
    routeLegTravelMinutes = [];
    deadheadRouteMiles = { toPickup:0, fromDestination:0, fromReturn:0 };

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
      routeLegTravelMinutes = legs.map((leg) => Number(leg?.duration_in_traffic?.value || leg?.duration?.value || 0) / 60);
      miles = legs.reduce((sum, leg) => sum + (Number(leg?.distance?.value || 0) / 1609.34), 0);
      durationMinutes = legs.reduce((sum, leg) => sum + (Number(leg?.duration?.value || 0) / 60), 0);
      trafficDurationMinutes = legs.reduce((sum, leg) => sum + (Number(leg?.duration_in_traffic?.value || leg?.duration?.value || 0) / 60), 0);
      durationText = String(legs.map((leg) => String(leg?.duration?.text || '').trim()).filter(Boolean).join(' + '));
      const trafficText = String(legs.map((leg) => String(leg?.duration_in_traffic?.text || '').trim()).filter(Boolean).join(' + '));
      if(trafficText && trafficDurationMinutes > durationMinutes){
        durationText = `${durationText} (traffic ${trafficText})`;
      }
      const yardRoute = await estimateYardToPickupRoute(pickup, tripDate, String(appointmentTimeInput?.value || '').trim());
      if(estimateVersion!==routeEstimateVersion)return estimateState;
      yardToPickupDurationMinutes = Math.max(0, Number(yardRoute.minutes || 0));
      yardToPickupTrafficDurationMinutes = Math.max(0, Number(yardRoute.trafficMinutes || 0));
      const deadhead = await estimateDeadheadMiles(pickup, destination, tripDate, fareTime);
      if(estimateVersion!==routeEstimateVersion)return estimateState;
      deadheadRouteMiles = deadhead;
      renderCustomerRoute(result, pickup, destinations);
      renderMultiStopFeasibility();
    }catch(err){
      const fallbackLegTravelMinutes = [];
      const fallbackMiles = await estimateFallbackRoute([pickup, ...destinations], undefined, [], fallbackLegTravelMinutes);
      if(estimateVersion!==routeEstimateVersion)return estimateState;
      if(fallbackMiles){
        const deadhead = await estimateDeadheadMiles(pickup, destination, tripDate, fareTime);
        if(estimateVersion!==routeEstimateVersion)return estimateState;
        deadheadRouteMiles = deadhead;
        const fallbackDurationMinutes = fallbackLegTravelMinutes.reduce((sum, minutes) => sum + minutes, 0);
        routeLegTravelMinutes = fallbackLegTravelMinutes;
        const fallbackBreakdown = calculateFareBreakdown(service, fallbackMiles, tripDate, fareTime, { durationMinutes: fallbackDurationMinutes, trafficDurationMinutes: fallbackDurationMinutes });
        renderFareEstimateBreakdown(fallbackBreakdown, fallbackMiles, `Estimated locally (~${fallbackDurationMinutes} min)`, fallbackDurationMinutes, fallbackDurationMinutes);
        setStatus('Your route and fare were estimated using the available location information.', 'ok');
        syncSectionProgressUi();
        return estimateState;
      }
      markDestinationUnconfirmed();
      const fallbackBreakdown = calculateFareBreakdown(service, 0, tripDate, fareTime, { durationMinutes: 0, trafficDurationMinutes: 0 });
      renderFareEstimateBreakdown(fallbackBreakdown, 0, '-', 0, 0);
      setStatus('We could not calculate this route. Check the addresses or call (888) 760-4990 for booking help.', 'err');
      syncSectionProgressUi();
      return estimateState;
    }

    const breakdown = calculateFareBreakdown(service, miles, tripDate, fareTime, { durationMinutes, trafficDurationMinutes });
    renderFareEstimateBreakdown(breakdown, miles, durationText || '-', durationMinutes, trafficDurationMinutes);
    renderMultiStopFeasibility();
    setStatus('Route and fare estimate updated.', 'ok');
    syncSectionProgressUi();
    saveBookingDraft();
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
    fareConfirmCancel?.addEventListener('click',()=>fareConfirmDialog?.close());
    fareConfirmAccept?.addEventListener('click',()=>{
      autoEstimate.cancel();
      routeEstimateVersion++;
      updateFareConfirmationState();
      confirmedFareSignature=fareEstimateSignature;
      fareSubmissionAuthorized=true;
      fareConfirmDialog?.close();
      syncSectionProgressUi();
      setStatus('Fare estimate confirmed. Sending your ride request...', 'ok');
      window.setTimeout(()=>form?.requestSubmit(),0);
    });
    reviewFareBtn?.addEventListener('click',reopenFareConfirmation);
    $('reviewScheduleBtn')?.addEventListener('click',()=>{
      const dateInput=$('reviewScheduleDate'),timeInput=$('reviewScheduleTime'),message=$('reviewScheduleMessage');
      if(dateInput){dateInput.value=String($('tripDate')?.value||'');dateInput.min=String($('tripDate')?.min||new Date().toISOString().slice(0,10));}
      if(timeInput)timeInput.value=String(appointmentTimeInput?.value||'');
      if(message)message.textContent='';
      $('reviewScheduleDialog')?.showModal();
    });
    $('closeReviewScheduleBtn')?.addEventListener('click',()=>$('reviewScheduleDialog')?.close());
    $('saveReviewScheduleBtn')?.addEventListener('click',async()=>{
      const dateInput=$('reviewScheduleDate'),timeInput=$('reviewScheduleTime'),message=$('reviewScheduleMessage');
      if(!dateInput?.value||!timeInput?.value){if(message)message.textContent='Choose both an appointment date and time.';return;}
      if(dateInput.min&&dateInput.value<dateInput.min){if(message)message.textContent='Choose today or a future date.';dateInput.focus();return;}
      $('tripDate').value=dateInput.value;
      appointmentTimeInput.value=timeInput.value;
      $('tripDate').dispatchEvent(new Event('change',{bubbles:true}));
      appointmentTimeInput.dispatchEvent(new Event('change',{bubbles:true}));
      if(message)message.textContent='Recalculating your pickup time and fare…';
      try{
        await estimateRouteAndFare({promptConfirmation:false});
        applyPickupEstimateFromAppointment();
        syncSectionProgressUi();
        if(message)message.textContent='Schedule updated. Your pickup estimate and fare have been recalculated.';
      }catch(error){if(message)message.textContent=error?.message||'We could not recalculate this schedule. Please try again.';return;}
    });
    nextStepAction?.addEventListener('click',()=>{
      const targetId=nextStepAction.dataset.target||'riderDetailsSection';
      const focusId=nextStepAction.dataset.focus||'';
      if(targetId==='submitBtn'){
        submitBtn?.focus();
        submitBtn?.scrollIntoView({behavior:'smooth',block:'center'});
      }else{
        revealSectionForAction(targetId,focusId);
      }
    });
    journeyHeaderAction?.addEventListener('click',()=>{
      const targetId=journeyHeaderAction.dataset.target||nextStepAction?.dataset.target||'riderDetailsSection';
      const focusId=journeyHeaderAction.dataset.focus||nextStepAction?.dataset.focus||'name';
      if(targetId==='submitBtn'){submitBtn?.scrollIntoView({behavior:'smooth',block:'center'});submitBtn?.focus();}
      else revealSectionForAction(targetId,focusId);
    });
    journeySegments?.querySelectorAll('.journeyStep').forEach((segment)=>{
      const navigate=()=>{
        if(segment.getAttribute('aria-disabled')==='true')return;
        const targetId=String(segment.dataset.target||'');
        const target=$(targetId);
        if(!targetId||!target)return;
        if(bookingSubmitted&&targetId!=='paymentSection'){
          editingBookingReference=currentBookingReference;
          bookingSubmitted=false;
          setStatus(`Editing booking ${editingBookingReference}. Submit your changes to update this same booking.`, 'ok');
        }
        journeyNavigationOverride=targetId;
        expandedSections.add(targetId);
        target.classList.remove('sectionCollapsed');
        document.body.classList.remove('showCompletedSections');
        syncSectionProgressUi();
        target.scrollIntoView?.({behavior:'smooth',block:'start'});
      };
      segment.addEventListener('click',navigate);
      segment.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate();}});
    });
    form.addEventListener('input',scheduleBookingDraftSave);
    form.addEventListener('change',scheduleBookingDraftSave);
    form.addEventListener('input',scheduleBookingNudge);
    form.addEventListener('change',scheduleBookingNudge);
    coreActionsBound = true;
  }

  function bindAuthActions(){
    if(authActionsBound) return;
    const authSection=$('bookingLoginSection');
    const authPanelToggle=$('toggleAuthPanelBtn');
    authPanelToggle?.addEventListener('click',()=>{
      const opening=authSection?.classList.contains('authCollapsed');
      authSection?.classList.toggle('authCollapsed',!opening);
      authPanelToggle.setAttribute('aria-expanded',String(Boolean(opening)));
      authPanelToggle.textContent=opening?'Hide account options':'Sign in or save 5%';
      if(opening)loginEmail?.focus();
    });
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
    if(authActionBtn) authActionBtn.addEventListener('click',()=>{
      if(!currentUser && authSection?.classList.contains('authCollapsed')){
        authSection.classList.remove('authCollapsed');
        authPanelToggle?.setAttribute('aria-expanded','true');
        if(authPanelToggle)authPanelToggle.textContent='Hide account options';
        authSection.scrollIntoView({behavior:'smooth',block:'start'});
        window.setTimeout(()=>loginEmail?.focus(),250);
        return;
      }
      handleAuthAction();
    });
    if(loginPassword) loginPassword.addEventListener('keydown', (event) => {
      if(event.key === 'Enter'){
        event.preventDefault();
        loginFromBookingApp();
      }
    });
    if(showPasswordToggle && loginPassword){
      showPasswordToggle.addEventListener('click', () => {
        const nextState = showPasswordToggle.getAttribute('aria-pressed') !== 'true';
        showPasswordToggle.setAttribute('aria-pressed', String(nextState));
        showPasswordToggle.setAttribute('aria-label', nextState ? 'Hide password' : 'Show password');
        showPasswordToggle.textContent = nextState ? 'Hide' : 'Show';
        loginPassword.type = nextState ? 'text' : 'password';
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
    rideChoiceConfirmed = false;
    const allowed = allowedServicesForRole(currentUserRole);
    if(!clean){
      $('service').value = '';
      serviceChips.querySelectorAll('.chip').forEach((chip) => {
        chip.classList.remove('active');
        chip.setAttribute('aria-pressed', 'false');
      });
      renderRateEditor('');
      renderRideMarketplace();
      syncSectionProgressUi();
      return;
    }
    if(!allowed.has(clean)){
      const fallback = Array.from(allowed)[0] || 'ambulatory';
      $('service').value = fallback;
      setLoginMessage('This role cannot book that ride type.', true);
      return selectService(fallback);
    }
    $('service').value = clean;
    const selectedServiceChip = serviceChips.querySelector(`[data-service="${clean}"]`);
    if(selectedServiceChip?.classList.contains('secondaryRideOption')) setSecondaryRideOptionsExpanded(true);
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
    renderRideMarketplace();
    renderMultiStopFeasibility();
    autoEstimate();
    syncSectionProgressUi();
  }

  function setSecondaryRideOptionsExpanded(expanded){
    const toggle = $('toggleMoreRideOptions');
    serviceChips.querySelectorAll('.secondaryRideOption').forEach((chip) => { chip.hidden = !expanded; });
    if(toggle){
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show fewer ride options' : 'Show more ride options';
    }
  }

  function bindServiceChips(){
    serviceChips.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => selectService(chip.dataset.service));
    });
    $('toggleMoreRideOptions')?.addEventListener('click', (event) => {
      setSecondaryRideOptionsExpanded(event.currentTarget.getAttribute('aria-expanded') !== 'true');
      syncMapViewport();
      window.setTimeout(syncMapViewport,260);
    });
    const applyQuickRecommendation = () => {
      const answers = {
        remainsInWheelchair: document.querySelector('input[name="quickWheelchair"]:checked')?.value || 'no',
        lyingDown: document.querySelector('input[name="quickLyingDown"]:checked')?.value || 'no',
        extraSpace: document.querySelector('input[name="quickExtraSpace"]:checked')?.value || 'no'
      };
      const recommendation = window.NexusServiceGuidance?.recommendRideType(answers);
      if(!recommendation) return;
      selectService(recommendation.service);
      const chip = serviceChips.querySelector(`[data-service="${recommendation.service}"]`);
      const label = String(chip?.querySelector('.serviceCardName')?.textContent || chip?.textContent || recommendation.service).trim();
      if(mobilityRecommendation) mobilityRecommendation.textContent = `Recommended: ${label}. ${recommendation.reason}`;
      window.nexusTrack?.('booking_mobility_recommendation', { service_type: recommendation.service });
    };
    mobilityQuestions?.querySelectorAll('input[type="radio"]').forEach((input) => input.addEventListener('change', applyQuickRecommendation));
  }

  function selectedRecurrenceDays(){
    return Array.from(document.querySelectorAll('input[name="recurrenceDay"]:checked')).map((input)=>input.value);
  }

  function syncTripScheduleUi(){
    const type=String(tripType?.value||'ONE_WAY').toUpperCase();
    if(roundTripFields)roundTripFields.hidden=type!=='ROUND_TRIP';
    if(recurringRideFields)recurringRideFields.hidden=type!=='RECURRING';
    if(returnTripDate)returnTripDate.required=type==='ROUND_TRIP';
    if(returnTripTime)returnTripTime.required=type==='ROUND_TRIP';
    if(recurrenceEndDate)recurrenceEndDate.required=type==='RECURRING';
    if(type!=='ROUND_TRIP'){if(returnTripDate)returnTripDate.value='';if(returnTripTime)returnTripTime.value='';}
    if(type!=='RECURRING'){if(recurrenceEndDate)recurrenceEndDate.value='';document.querySelectorAll('input[name="recurrenceDay"]').forEach((input)=>{input.checked=false;});}
    updateTripScheduleSavingsMessage();
    syncCalculatedWaitingUi();
  }

  function isTripScheduleComplete(){
    const type=String(tripType?.value||'ONE_WAY').toUpperCase();
    if(type==='ROUND_TRIP')return Boolean(returnTripDate?.value&&returnTripTime?.value);
    if(type==='RECURRING')return Boolean(recurrenceEndDate?.value&&selectedRecurrenceDays().length);
    return true;
  }

  function switchAppTab(tabName){
    const tab=['book','manifest','contact'].includes(tabName)?tabName:'book';
    document.body.dataset.activeTab=tab;
    form.hidden=tab!=='book';
    if(journeyHeader)journeyHeader.hidden=tab!=='book';
    if(manifestTabPanel)manifestTabPanel.hidden=tab!=='manifest';
    if(contactTabPanel)contactTabPanel.hidden=tab!=='contact';
    document.querySelectorAll('[data-app-tab]').forEach((button)=>{const active=button.dataset.appTab===tab;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    if(tab==='manifest')loadTripManifest();
    window.scrollTo({top:0,behavior:document.body.classList.contains('accessReducedMotion')?'auto':'smooth'});
    if(tab!=='book'){const panel=tab==='manifest'?manifestTabPanel:contactTabPanel;window.setTimeout(()=>panel?.focus({preventScroll:true}),160);}
    window.requestAnimationFrame(syncAdaptiveBottomDock);
  }

  let adaptiveDockFrame=0;
  function syncAdaptiveBottomDock(){
    window.cancelAnimationFrame(adaptiveDockFrame);
    adaptiveDockFrame=window.requestAnimationFrame(()=>{
      const phone=document.querySelector('.phone');
      const bottomBar=document.querySelector('.bottomBar');
      const tabBar=document.querySelector('.appTabBar');
      if(!phone||!tabBar)return;
      if(document.body.classList.contains('bookingRideMarketplaceView')||document.body.classList.contains('bookingReviewMapView')||document.body.classList.contains('bookingPaymentMapView')){
        phone.classList.remove('adaptiveInlineDock');
        return;
      }
      const tab=document.body.dataset.activeTab||'book';
      const activeContent=tab==='manifest'?manifestTabPanel:(tab==='contact'?contactTabPanel:form);
      if(!activeContent)return;
      const bottomBarHeight=tab==='book'&&bottomBar?bottomBar.offsetHeight:0;
      const inlineBarHeight=phone.classList.contains('adaptiveInlineDock')&&tab==='book'?bottomBarHeight:0;
      const contentBottom=activeContent.offsetTop+activeContent.offsetHeight-inlineBarHeight;
      const requiredHeight=contentBottom+bottomBarHeight+tabBar.offsetHeight+16;
      phone.classList.toggle('adaptiveInlineDock',requiredHeight<window.innerHeight);
    });
  }

  function installAdaptiveBottomDock(){
    const phone=document.querySelector('.phone');
    if(!phone)return;
    const observer=new ResizeObserver(syncAdaptiveBottomDock);
    [form,manifestTabPanel,contactTabPanel].forEach((element)=>element&&observer.observe(element));
    window.addEventListener('resize',syncAdaptiveBottomDock,{passive:true});
    window.visualViewport?.addEventListener('resize',syncAdaptiveBottomDock,{passive:true});
    syncAdaptiveBottomDock();
  }

  function tripMatchesRange(booking,range){
    const value=new Date(`${booking?.date||''}T12:00:00`);if(Number.isNaN(value.getTime()))return false;
    const now=new Date();const dateKey=(date)=>`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if(range==='today')return dateKey(value)===dateKey(now);
    if(range==='week'){const start=new Date(now);start.setHours(0,0,0,0);start.setDate(now.getDate()-now.getDay());const end=new Date(start);end.setDate(start.getDate()+7);return value>=start&&value<end;}
    if(range==='month')return value.getFullYear()===now.getFullYear()&&value.getMonth()===now.getMonth();
    return value.getFullYear()===now.getFullYear();
  }

  function renderManifestCard(booking){
    const card=document.createElement('article');card.className='tripManifestCard';
    const title=document.createElement('h3');title.textContent=`${booking?.date||'Date pending'} · ${booking?.reference||booking?.id||'Trip'}`;
    const status=document.createElement('span');status.className='tripStatusPill';status.textContent=booking?.statusLabel||booking?.status||'Pending';
    const route=document.createElement('p');route.className='tripManifestMeta';route.textContent=[booking?.pickup,booking?.destination].filter(Boolean).join(' → ')||'Route pending';
    const time=document.createElement('p');time.className='tripManifestMeta';time.textContent=`Pickup: ${booking?.time||'-'} · ${String(booking?.service||'Ride').replaceAll('_',' ')}`;
    const reuse=document.createElement('button');reuse.type='button';reuse.className='ghost reuseRouteBtn';reuse.textContent='Book this route again';reuse.addEventListener('click',()=>reuseTripRoute(booking));
    card.append(title,status,route,time,reuse);return card;
  }

  function renderSignedInManifest(){
    if(!tripManifestList)return;tripManifestList.replaceChildren();
    const filtered=manifestTrips.filter((trip)=>tripMatchesRange(trip,manifestRange));
    if(!filtered.length){const empty=document.createElement('p');empty.className='subtle';empty.textContent=`No trips found for this ${manifestRange}.`;tripManifestList.append(empty);return;}
    filtered.forEach((trip)=>tripManifestList.append(renderManifestCard(trip)));
  }

  async function loadTripManifest(){
    const signedIn=Boolean(token());if(signedInManifest)signedInManifest.hidden=!signedIn;if(guestManifestLookup)guestManifestLookup.hidden=signedIn;
    if(!signedIn)return;
    if(tripManifestList){tripManifestList.replaceChildren();const loading=document.createElement('p');loading.className='subtle';loading.textContent='Loading your trips…';tripManifestList.append(loading);}
    try{const r=await fetch('/api/portal/trips',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Unable to load trips');manifestTrips=Array.isArray(data.trips)?data.trips:[];renderSignedInManifest();}catch(err){if(tripManifestList){tripManifestList.replaceChildren();const error=document.createElement('p');error.className='subtle';error.textContent=String(err.message||'Unable to load trips');tripManifestList.append(error);}}
  }

  function reuseTripRoute(booking){
    if($('pickup'))$('pickup').value=String(booking?.pickup||'');if($('destination'))$('destination').value=String(booking?.destination||'');
    const service=normalizeService(booking?.service);if(service&&allowedServicesForRole(currentUserRole).has(service))selectService(service);
    if(currentUser){if($('name')&&!$('name').value)$('name').value=String(currentUser.name||currentUser.display_name||'');if($('email')&&!$('email').value)$('email').value=String(currentUser.email||'');if($('phone')&&!$('phone').value)$('phone').value=formatPhone(String(currentUser.phone||''));riderDetailsConfirmed=Boolean($('name')?.value&&$('phone')?.value);}
    markDestinationUnconfirmed();expandedSections.add('pickupDropoffSection');switchAppTab('book');syncSectionProgressUi();revealSectionForAction('pickupDropoffSection','confirmPickupDropoffBtn');
  }

  function consumeCaretakerPlan(){
    let plan=null,account=null;
    try{plan=JSON.parse(sessionStorage.getItem('nexusCaretakerPlan')||'null');account=JSON.parse(sessionStorage.getItem('nexusUser')||'null');}catch{}
    sessionStorage.removeItem('nexusCaretakerPlan');
    if(!plan||!account||plan.ownerId!==account.id||!token())return false;
    currentPatientPreferences=null;
    if(patientDefaultsBanner)patientDefaultsBanner.hidden=true;
    document.querySelectorAll('input[name="remainsInWheelchair"]').forEach(input=>{input.checked=false;});
    reuseTripRoute(plan);
    for(const [id,value] of Object.entries({name:plan.name,phone:plan.phone,email:plan.email,tripDate:plan.date,tripTime:String(plan.trip_time||'').slice(0,5),appointmentTime:String(plan.appointment_time||'').slice(0,5),notes:plan.notes})){
      if($(id))$(id).value=String(value||'');
    }
    if(tripType)tripType.value='ONE_WAY';
    riderDetailsConfirmed=false;
    syncTripScheduleUi();syncSectionProgressUi();
    const notice=document.createElement('div');notice.className='msg ok';notice.setAttribute('role','status');
    notice.textContent=`Caretaker plan loaded. Planned pickup: ${String(plan.trip_time||'').slice(0,5)}. Booking recalculates pickup time from your appointment and route. Review the patient, contact phone, addresses and times, then complete booking and payment. This plan is not yet a reservation.`;
    form.prepend(notice);
    return true;
  }

  function consumePatientRepeatRide(){
    let booking=null;
    try{booking=JSON.parse(sessionStorage.getItem('nexusRepeatRide')||'null');sessionStorage.removeItem('nexusRepeatRide');}catch{sessionStorage.removeItem('nexusRepeatRide');}
    if(!booking||!String(booking.pickup||'').trim()||!String(booking.destination||'').trim())return false;
    reuseTripRoute(booking);
    if($('tripDate'))$('tripDate').value='';
    if($('tripTime'))$('tripTime').value='';
    if($('appointmentTime'))$('appointmentTime').value='';
    if(tripType)tripType.value='ONE_WAY';
    syncTripScheduleUi();
    if($('notes')&&String(booking.notes||'').trim())$('notes').value=String(booking.notes).trim();
    let repeatNotice=$('repeatRideNotice');
    if(!repeatNotice){repeatNotice=document.createElement('div');repeatNotice.id='repeatRideNotice';repeatNotice.className='msg ok';repeatNotice.setAttribute('role','status');(patientDefaultsBanner||form)?.insertAdjacentElement(patientDefaultsBanner?'afterend':'afterbegin',repeatNotice);}
    repeatNotice.textContent='Route and transportation needs copied. Choose a new appointment date and time to continue.';
    window.nexusTrack?.('repeat_booking_started',{service_type:String(booking.service||'unspecified')});
    return true;
  }

  async function lookupGuestManifest(){
    const reference=String($('manifestReference')?.value||'').trim();const phone=formatPhone(String($('manifestPhone')?.value||''));const message=$('manifestLookupMessage');
    if(!reference||!phone){if(message)message.textContent='Enter the booking reference and phone number.';return;}
    if(message)message.textContent='Finding your trip…';if(guestManifestResult)guestManifestResult.replaceChildren();
    try{const r=await fetch(`/api/bookings/${encodeURIComponent(reference)}?phone=${encodeURIComponent(phone)}`,{cache:'no-store'});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Trip not found');if(guestManifestResult)guestManifestResult.append(renderManifestCard(data.booking));if(message)message.textContent='Trip found.';}catch(err){if(message)message.textContent=String(err.message||'Unable to find trip.');}
  }

  function bindAccessibilityControls(){
    const settings = [
      ['largeTextToggle','accessLargeText','nexusAccessLargeText'],
      ['highContrastToggle','accessHighContrast','nexusAccessHighContrast'],
      ['reduceMotionToggle','accessReducedMotion','nexusAccessReducedMotion']
    ];
    settings.forEach(([id,className,key]) => {
      const button=$(id); if(!button) return;
      let enabled=false; try{enabled=localStorage.getItem(key)==='true';}catch{}
      document.body.classList.toggle(className,enabled); button.setAttribute('aria-pressed',String(enabled));
      button.addEventListener('click',()=>{enabled=!document.body.classList.contains(className);document.body.classList.toggle(className,enabled);button.setAttribute('aria-pressed',String(enabled));try{localStorage.setItem(key,String(enabled));}catch{} const status=$('accessibilityStatus');if(status)status.textContent=`${button.textContent} ${enabled?'on':'off'}.`;});
    });
    const readButton=$('readNextStepBtn');
    if(readButton) readButton.addEventListener('click',()=>{
      if(!('speechSynthesis' in window)) return;
      if(window.speechSynthesis.speaking){window.speechSynthesis.cancel();readButton.textContent='Read next step';readButton.setAttribute('aria-pressed','false');return;}
      const message=new SpeechSynthesisUtterance(`Next step. ${String(nextStepText?.textContent||'Continue completing the booking form.')}`);
      message.onend=()=>{readButton.textContent='Read next step';readButton.setAttribute('aria-pressed','false');};
      readButton.textContent='Stop reading';readButton.setAttribute('aria-pressed','true');window.speechSynthesis.speak(message);
    });
  }

  function bindRideGuidance(){
    if(!rideGuidanceDialog || !rideGuidanceForm) return;
    helpChooseRideBtn?.addEventListener('click',()=>rideGuidanceDialog.showModal());
    getRideRecommendationBtn?.addEventListener('click',()=>{
      const answers={};
      rideGuidanceForm.querySelectorAll('input[type="radio"]:checked').forEach((input)=>{answers[input.name]=input.value;});
      const recommendation=window.NexusServiceGuidance?.recommendRideType(answers);
      if(!recommendation) return;
      recommendedRideService=recommendation.service;
      const label=serviceChips.querySelector(`[data-service="${recommendation.service}"] .serviceCardName`)?.textContent || recommendation.service;
      $('rideGuidanceRecommendation').textContent=`Recommended: ${label}`;
      $('rideGuidanceReason').textContent=`Why it may fit: ${recommendation.reason}`;
      $('rideGuidanceResult').hidden=false; useRideRecommendationBtn.hidden=false;
    });
    useRideRecommendationBtn?.addEventListener('click',()=>{if(!recommendedRideService)return;selectService(recommendedRideService);rideGuidanceDialog.close();serviceChips.querySelector(`[data-service="${recommendedRideService}"]`)?.focus();});
    $('closeRideGuidanceBtn')?.addEventListener('click',()=>rideGuidanceDialog.close());
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
      const vehicles = [];
      lastTelemetryVehicles = [];
      lastTelemetryUsingLocalMock = false;
      updateTelemetrySpotlight();

      if(!telemetryMap){
        const routePoints = await resolveFallbackRoutePoints();
        renderTelemetryFallback([], false, routePoints);
        return;
      }
      if(telemetryStatus){
        telemetryStatus.hidden = false;
        telemetryStatus.textContent = 'Driver location is available in LiveCare within one hour of pickup after your driver starts the trip.';
      }
      if(telemetryList) telemetryList.innerHTML = '';
      const activeIds = new Set();
      telemetryMarkers.forEach((marker, id) => {
        if(!activeIds.has(id)){
          marker.setMap(null);
          telemetryMarkers.delete(id);
        }
      });
      applyFocusMode();
      fitCombinedViewport(vehicles);
    }catch(err){
      if(telemetryStatus){
        telemetryStatus.hidden = false;
        telemetryStatus.textContent = 'Route Pulse is temporarily unavailable. You can continue booking your ride.';
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
        const routePoints = await resolveFallbackRoutePoints();
        renderTelemetryFallback([], false, routePoints);
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
      telemetryStatus.textContent = 'The route map is temporarily unavailable. You can continue booking your ride.';
    }
  }

  async function submitBooking(event){
    event.preventDefault();
    if(bookingSubmissionPending) return;
    clearStatus();
    setBookingOutcome('', 'pending');
    updateFareConfirmationState();
    if(!fareEstimateSignature||confirmedFareSignature!==fareEstimateSignature||!fareSubmissionAuthorized){
      fareSubmissionAuthorized=false;
      setStatus('Confirm the current fare estimate before booking your ride.', 'err');
      lastPromptedFareSignature='';
      promptFareConfirmation(true);
      return;
    }
    fareSubmissionAuthorized=false;
    const routeDestinations = getRouteDestinations();
    const routeStops = getRouteStops();
    const destinationReady = isMultipleStopsEnabled() ? areDestinationRowsFilled() : Boolean(routeDestinations[0]);

    const payload = {
      tripMode:['ADMIN','DISPATCHER'].includes(String(currentUserRole||'').toUpperCase()) ? ($('staffTripMode')?.value || 'REAL') : 'REAL',
      name: $('name').value.trim(),
      phone: formatPhone($('phone').value.trim()),
      email: $('email').value.trim(),
      payerType: $('payerType')?.value || 'SELF_PAY',
      insuranceCarrier: String(insuranceCarrier?.value || '').trim(),
      tripType: String(tripType?.value || 'ONE_WAY').toUpperCase(),
      returnTripDate: String(returnTripDate?.value || '').trim(),
      returnTripTime: String(returnTripTime?.value || '').trim(),
      recurrenceDays: selectedRecurrenceDays(),
      recurrenceEndDate: String(recurrenceEndDate?.value || '').trim(),
      service: normalizeService($('service').value),
      pickup: $('pickup').value.trim(),
      destination: routeDestinations.length > 1 ? routeDestinations.join(' → ') : String(routeDestinations[0] || '').trim(),
      flightInfo: getFlightDetailsPayload(),
      destinations: routeDestinations,
      multipleStops: routeDestinations.length > 1,
      stopCount: routeDestinations.length,
      routeStops,
      appointmentTimes: getLegAppointments(),
      stopWaitMinutes: getStopWaitMinutes(),
      waitMinutes: getAdditionalWaitMinutes(),
      waitingCharge: getWaitingCharge(normalizeService($('service').value)).waitCharge,
      deadheadSegments:estimateState.deadheadSegments,
      deadheadCharge:estimateState.deadheadCharge,
      shortNoticeCharge:estimateState.shortNoticeCharge,
      scheduleFeasibility: evaluateMultiStopFeasibility(),
      date: $('tripDate').value,
      scheduleBasis: isPickupTimeBasis()?'PICKUP':'APPOINTMENT',
      appointmentTime: String(appointmentTimeInput?.value || '').trim(),
      time: $('tripTime').value,
      notes: $('notes').value.trim(),
      distanceMiles: Number(estimateState.miles || 0),
      estimatedDuration: estimateState.durationText || null,
      estimatedFareBeforeDiscount: Number(estimateState.preDiscountFare || estimateState.fare || 0),
      // The server redeems the coupon and applies its discount exactly once.
      estimatedFare: Number((!editingBookingReference ? appliedPromotion?.originalFare : null) ?? estimateState.fare ?? 0),
      memberDiscountPct: Number(estimateState.discountPct || 0),
      fareInputs:{miles:Number(estimateState.miles||0),durationMinutes:Number(estimateState.durationMinutes||0),trafficDurationMinutes:Number(estimateState.trafficDurationMinutes||0),stopWaitMinutes:getStopWaitMinutes().reduce((sum,value)=>sum+Number(value||0),0),deadheadSegments:estimateState.deadheadSegments||[0,0],discountPct:Number(estimateState.discountPct||0),scheduleBasis:isPickupTimeBasis()?'PICKUP':'APPOINTMENT',finalAppointmentTime:getLegAppointments().at(-1)?.appointmentTime||''},
      memberDiscountAmount: Number(estimateState.memberSavings || 0),
      promotionCode: appliedPromotion?.code || '',
      pickupTimeEstimate: String($('tripTime')?.value || '').trim(),
      yardAddress: companyYardAddress,
      yardToPickupMinutes: Math.max(0, Number(yardToPickupDurationMinutes || 0)),
      yardToPickupTrafficMinutes: Math.max(0, Number(yardToPickupTrafficDurationMinutes || 0)),
      preTripInspectionMinutes: Math.max(0, Number(preTripInspectionMinutes || 0)),
      checkInTime: getDriverYardReportTime(),
      driverReportTime: getDriverYardReportTime(),
      paymentWindowLabel: 'Payment link window: 60 to 30 minutes before pickup',
      requestedByRole: String(currentUserRole || 'CUSTOMER').toUpperCase(),
      requestedByUser: String(currentUser?.email || '').trim() || null,
      referralSource: String(currentUserRole || '').toUpperCase() === 'DRIVER' ? 'DRIVER_REFERRAL' : ''
    };

    const invalidRoundTrip=payload.tripType==='ROUND_TRIP'&&(!payload.returnTripDate||!payload.returnTripTime);
    const invalidRecurring=payload.tripType==='RECURRING'&&(!payload.recurrenceEndDate||!payload.recurrenceDays.length);
    const infeasibleMultiStop=payload.multipleStops&&!payload.scheduleFeasibility.feasible&&!payload.scheduleFeasibility.pending;
    if(!payload.name || !payload.phone || !payload.service || !payload.pickup || !routeDestinations.length || !payload.date || !isPrimaryScheduleInputComplete() || !payload.time || !destinationReady || (payload.payerType==='INSURANCE'&&!payload.insuranceCarrier) || invalidRoundTrip || invalidRecurring){
      setStatus('Please complete all required fields.', 'err');
      setBookingOutcome('Action required before booking', 'pending');
      if(!payload.name || !payload.phone || (payload.payerType==='INSURANCE'&&!payload.insuranceCarrier)){
        revealSectionForAction('riderDetailsSection', !payload.name ? 'name' : (!payload.phone ? 'phone' : 'insuranceCarrier'));
      }else if(!payload.pickup || !routeDestinations.length || !destinationReady){
        revealSectionForAction('pickupDropoffSection', !payload.pickup ? 'pickup' : 'destination');
      }else if(invalidRoundTrip){
        setStatus('Enter the return date and pickup time for the round trip.', 'err');
        revealSectionForAction('rideTypeSection', !payload.returnTripDate ? 'returnTripDate' : 'returnTripTime');
      }else if(invalidRecurring){
        setStatus('Choose at least one recurring day and an end date.', 'err');
        revealSectionForAction('rideTypeSection', !payload.recurrenceDays.length ? 'recurrenceDays' : 'recurrenceEndDate');
      }else{
        const missingLegTime = getLegAppointmentTimeInputs().find((input) => !input.value);
        const missingRideField = !payload.date ? 'tripDate' : (missingLegTime?.id || (!payload.appointmentTime ? 'appointmentTime' : 'tripTime'));
        revealSectionForAction('rideTypeSection', missingRideField);
      }
      return;
    }
    if(infeasibleMultiStop){
      setStatus(payload.scheduleFeasibility.message, 'err');
      setBookingOutcome('Multi-stop schedule needs adjustment', 'pending');
      revealSectionForAction('rideTypeSection', 'legAppointmentTimes');
      return;
    }
    if(!destinationConfirmed){
      setStatus('Confirm pickup and destination details before booking.', 'err');
      setBookingOutcome('Confirm pickup and destination before booking', 'pending');
      revealSectionForAction('pickupDropoffSection', 'confirmPickupDropoffBtn');
      return;
    }
    if(selectedFlightInfo && !$('flightAirportConfirmed')?.checked){
      setStatus('Confirm that the flight airport matches the selected pickup or destination.', 'err');
      revealSectionForAction('pickupDropoffSection', 'flightAirportConfirmed');
      return;
    }

    bookingSubmissionPending = true;
    journeyNavigationOverride = '';
    paymentSection.hidden = false;
    expandPaymentOptions();
    paymentSummary.textContent = 'Preparing your booking. Payment options will be ready shortly.';
    if(depositAmountLabel) depositAmountLabel.textContent = `$${(Math.round(Math.round(Number(estimateState.fare || 0) * 100) / 4) / 100).toFixed(2)}`;
    if(fullAmountLabel) fullAmountLabel.textContent = `$${Number(estimateState.fare || 0).toFixed(2)}`;
    [payDepositBtn, payFullBtn].forEach(button => { if(button){ button.hidden = false; button.disabled = true; } });
    [payStripeBtn, paySquareBtn].forEach(button => { if(button) button.hidden = true; });
    setPaymentMessage('Creating your booking before opening secure checkout...');
    syncSectionProgressUi();
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
      const updateReference=String(editingBookingReference||'').trim();
      const bookingEndpoint=updateReference?`/api/bookings/${encodeURIComponent(updateReference)}/update`:'/api/bookings';
      const r = await fetch(bookingEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      let data = await r.json().catch(() => ({}));
      const localStaticPreview=['localhost','127.0.0.1'].includes(window.location.hostname)&&r.status===404;
      if(localStaticPreview){
        data={booking:{reference:`LOCAL-${Date.now().toString().slice(-6)}`,estimatedFare:payload.estimatedFare,status:'PENDING_PAYMENT'},clientMessage:'Local preview booking created.',persisted:false,requiresOnlinePayment:true,depositRequired:true};
      }else if(!r.ok){
        throw new Error(data.error || 'Booking request failed');
      }

      const ref = data.booking?.reference || data.booking?.id || 'N/A';
      const confirmationMessage = String(data.clientMessage || data.message || '').trim();
      const pendingNotice = data.persisted===false
        ? ' Your request is pending confirmation from dispatch.'
        : '';
      const onlinePaymentEnabled = stripeEnabled || squareEnabled;
      const confirmationBase = (confirmationMessage || `Booking created. Reference: ${ref}`) + pendingNotice;
      if(data.isMockTrip || onlinePaymentEnabled){
        setStatus(confirmationBase, 'ok');
      }else{
        setStatus(`${confirmationBase} Dispatch will contact you shortly to finalize payment.`, 'ok');
      }
      const requiresDeposit = data.requiresOnlinePayment === true && data.depositRequired === true;
      const pendingApproval = data.pendingApproval === true;
      const coverageNotAvailable = data.coverageNotAvailable === true;
      const bookingStatus = String(data.booking?.status || '').toUpperCase().replaceAll('-', '_');
      const isPending = requiresDeposit || pendingApproval || data.persisted === false || r.status === 202 || bookingStatus === 'PENDING' || bookingStatus === 'PENDING_PAYMENT' || bookingStatus === 'PENDING_APPROVAL';
      const outcomeText = coverageNotAvailable ? 'Medicare not generally covered — self-pay required' : requiresDeposit ? '25% deposit required to confirm booking' : pendingApproval ? 'Booking Pending Approval' : isPending ? 'Booking Pending' : 'Booking Confirmed';
      const popupMessage = confirmationMessage || `Booking created. Reference: ${ref}`;
      if(data.requiresOnlinePayment===false){
        window.NexusTripPopup?.show({
          title: coverageNotAvailable ? 'Self-pay required' : (pendingApproval ? 'Pending approval' : (isPending ? 'Trip request received' : 'Trip booked successfully')),
          message: popupMessage,
          detail:isPending?(pendingApproval?'Coverage must be verified before this booking is confirmed.':'Dispatch will confirm and finalize your trip shortly.'):'Your trip is now booked and dispatch will follow up as needed.',
          accent:isPending?'#0f766e':'#0b1d47'
        });
      }
      window.scrollTo(0,0);
      document.documentElement.scrollTop=0;
      document.body.scrollTop=0;
      bookingSubmissionPending = false;
      showPaymentOptions(ref, Number(data.booking?.estimatedFare ?? payload.estimatedFare ?? 0), data.requiresOnlinePayment !== false);
      bookingSubmitted = true;
      editingBookingReference = '';
      journeyNavigationOverride = '';
      hideBookingNudge();
      window.nexusTrack?.('booking_complete',{
        service_type:String(payload.service||'unspecified'),
        booking_status:isPending?'pending':'confirmed'
      });
      completeBookingDraft();
      if(submitBtn) submitBtn.textContent = 'Book My Ride';
      syncSectionProgressUi();
      setBookingOutcome(outcomeText, isPending ? 'pending' : 'confirmed');
    }catch(err){
      bookingSubmissionPending = false;
      paymentSection.hidden = true;
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
      await applyPatientTransportationPreferences();
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
    currentPatientPreferences = null;
    currentUserRole = 'CUSTOMER';
    isAdminUser = false;
    applyRiderDetailsFromAuthUser();
    renderPatientDefaultsBanner();
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
    reorganizeBookingFlow();
    const now = new Date();
    const defaultDate = now.toISOString().slice(0,10);
    const maxRecurringDate=new Date(now.getTime()+84*86400000).toISOString().slice(0,10);
    bindManageTripActions(defaultDate, '');
    if($('tripDate')) $('tripDate').min = defaultDate;
    if(returnTripDate)returnTripDate.min=defaultDate;
    if(recurrenceEndDate){recurrenceEndDate.min=defaultDate;recurrenceEndDate.max=maxRecurringDate;}
    bindAuthActions();

    await loadIntegrationConfig();
    await loadPlatformSettings();
    await resolveUserAccess();
    applyAuthUi();
    bindServiceChips();
    bindBookingNudge();
    bindAccessibilityControls();
    bindRideGuidance();
    const syncInsuranceCarrierUi=()=>{const isPrivateInsurance=String(payerType?.value||'').toUpperCase()==='INSURANCE';if(insuranceCarrierField)insuranceCarrierField.hidden=!isPrivateInsurance;if(insuranceCarrier){insuranceCarrier.required=isPrivateInsurance;if(!isPrivateInsurance)insuranceCarrier.value='';}riderDetailsConfirmed=false;};
    payerType?.addEventListener('change',()=>{syncInsuranceCarrierUi();syncSectionProgressUi();});
    insuranceCarrier?.addEventListener('change',()=>{riderDetailsConfirmed=false;syncSectionProgressUi();});
    syncInsuranceCarrierUi();
    tripType?.addEventListener('change',()=>{syncTripScheduleUi();refreshFareForMembership();syncSectionProgressUi();});
    [returnTripDate,returnTripTime].forEach((input)=>input?.addEventListener('change',()=>{refreshFareForMembership();syncSectionProgressUi();}));
    recurrenceEndDate?.addEventListener('change',syncSectionProgressUi);
    ['flightNumber','flightAirportStop','tripDate','pickup','destination'].forEach((id)=>{
      const input=$(id);
      input?.addEventListener('input',()=>clearFlightLookup());
      input?.addEventListener('change',()=>clearFlightLookup());
    });
    $('destinationRows')?.addEventListener('input',()=>clearFlightLookup());
    $('destinationRows')?.addEventListener('change',()=>clearFlightLookup());
    $('lookupFlightBtn')?.addEventListener('click',lookupFlightTerminal);
    document.querySelectorAll('input[name="recurrenceDay"]').forEach((input)=>input.addEventListener('change',syncSectionProgressUi));
    syncTripScheduleUi();
    document.querySelectorAll('[data-app-tab]').forEach((button)=>button.addEventListener('click',()=>switchAppTab(button.dataset.appTab)));
    document.querySelectorAll('[data-manifest-range]').forEach((button)=>button.addEventListener('click',()=>{manifestRange=button.dataset.manifestRange||'today';document.querySelectorAll('[data-manifest-range]').forEach((item)=>item.classList.toggle('active',item===button));renderSignedInManifest();}));
    $('manifestLookupBtn')?.addEventListener('click',lookupGuestManifest);
    $('manifestPhone')?.addEventListener('blur',()=>{$('manifestPhone').value=formatPhone($('manifestPhone').value);});
    switchAppTab('book');
    installAdaptiveBottomDock();
    let journeyCompact=false;
    const syncJourneyCompact=()=>{
      const currentY=Math.max(0,window.scrollY);
      const next=journeyCompact?currentY>48:currentY>88;
      if(next!==journeyCompact){
        journeyCompact=next;
        journeyHeader?.classList.toggle('compact',next);
      }
    };
    window.addEventListener('scroll',syncJourneyCompact,{passive:true});
    syncJourneyCompact();
    const requestedService = getRequestedServiceFromUrl();
    selectService(requestedService || $('service').value);
    consumePatientRepeatRide();
    consumeCaretakerPlan();
    if(isAdminUser){
      renderRateEditor($('service').value);
      saveRateBtn.addEventListener('click', saveCurrentServiceRate);
      resetRateBtn.addEventListener('click', resetCurrentServiceRate);
    }
    bindCoreActions();
    bindSectionProgressTracking();
    bindRouteFieldListeners($('pickup'), 'pickup');
    bindRouteFieldListeners($('destination'), 'destination');
    if(multipleStopsToggle){
      multipleStopsToggle.addEventListener('change', () => {
        clearFlightLookup();
        markDestinationUnconfirmed();
        syncMultipleStopsUi();
      });
    }
    if(stopCountSelect){
      stopCountSelect.addEventListener('change', () => {
        clearFlightLookup();
        markDestinationUnconfirmed();
        syncMultipleStopsUi();
      });
    }
    syncMultipleStopsUi();
    if(confirmRiderBtn){
      confirmRiderBtn.addEventListener('click', confirmRiderDetails);
      confirmRiderBtn.disabled=false;
      confirmRiderBtn.textContent='Confirm Details';
    }
    if(confirmPickupDropoffBtn) confirmPickupDropoffBtn.addEventListener('click', confirmPickupDropoffDetails);
    $('continueRideBtn')?.addEventListener('click',async()=>{
      const continueButton=$('continueRideBtn');
      if(!riderDetailsConfirmed){setStatus('Confirm the rider details first.','err');revealSectionForAction('riderDetailsSection','name');return;}
      if(!destinationConfirmed){setStatus('Confirm the pickup and destination first.','err');revealSectionForAction('pickupDropoffSection','pickup');return;}
      if(!normalizeService($('service')?.value)||!$('tripDate')?.value||!isPrimaryScheduleInputComplete()){setStatus(isMultipleStopsEnabled()?'Choose a ride and enter the appointment time for every stop.':'Choose a ride and enter either a pickup or appointment time.','err');return;}
      const feasibility=renderMultiStopFeasibility();
      if(isMultipleStopsEnabled()&&!feasibility.feasible&&!feasibility.pending){setStatus(feasibility.message,'err');return;}
      rideChoiceConfirmed=true;
      journeyNavigationOverride='fareSummarySection';
      document.body.classList.remove('showCompletedSections');
      setBusy(continueButton,true,'Preparing review...','Book My Ride');
      setStatus('Preparing your fare for review...', 'ok');
      try{
        updateFareConfirmationState();
        if(!fareEstimateSignature||!Number(estimateState.miles||0)){
          await estimateRouteAndFare({promptConfirmation:false});
          applyPickupEstimateFromAppointment();
          updateFareConfirmationState();
        }
        if(!fareEstimateSignature||!$('tripTime')?.value){setStatus('We could not prepare the fare. Check the addresses and appointment time, then try again.','err');return;}
        confirmedFareSignature='';
        syncSectionProgressUi();
        setStatus('Review and confirm the fare estimate to continue to payment.', 'ok');
        lastPromptedFareSignature='';
        promptFareConfirmation(true);
      }
      finally{setBusy(continueButton,false,'Preparing review...','Book My Ride');}
    });
    const toggleRideSheet=()=>{
      const collapsed=document.body.classList.toggle('rideSheetCollapsed');
      [$('rideSheetToggle'),$('rideSheetHandle')].forEach((toggle)=>{
        toggle?.setAttribute('aria-expanded',String(!collapsed));
        toggle?.setAttribute('aria-label',collapsed?'Expand ride choices':'Collapse ride choices');
      });
      syncMapViewport();
      window.setTimeout(syncMapViewport,280);
    };
    $('rideSheetToggle')?.addEventListener('click',toggleRideSheet);
    $('rideSheetHandle')?.addEventListener('click',toggleRideSheet);
    $('paymentSheetHandle')?.addEventListener('click',()=>{
      const collapsed=document.body.classList.toggle('paymentSheetCollapsed');
      const handle=$('paymentSheetHandle');
      handle?.setAttribute('aria-expanded',String(!collapsed));
      handle?.setAttribute('aria-label',collapsed?'Expand payment options':'Collapse payment options');
      syncMapViewport();
      window.setTimeout(syncMapViewport,280);
    });
    $('rideSchedulePill')?.addEventListener('click',()=>revealSectionForAction('pickupDropoffSection','tripDate'));
    $('rideRiderPill')?.addEventListener('click',()=>revealSectionForAction('riderDetailsSection','name'));
    if(payStripeBtn) payStripeBtn.addEventListener('click', () => startHostedPayment('stripe', 'full'));
    if(paySquareBtn) paySquareBtn.addEventListener('click', () => startHostedPayment('square', 'full'));
    if(payDepositBtn) payDepositBtn.addEventListener('click', () => startHostedPayment('stripe', 'deposit'));
    if(payFullBtn) payFullBtn.addEventListener('click', () => startHostedPayment('stripe', 'full'));
    hidePaymentOptions();

    ['tripDate','appointmentTime','pickup','destination'].forEach((id) => {
      ['change','input'].forEach((evt) => {
        $(id).addEventListener(evt, () => {
          setBookingOutcome('', 'pending');
          if((id === 'tripDate') && estimateState.miles > 0){
            const breakdown = calculateFareBreakdown(normalizeService($('service').value), estimateState.miles, $('tripDate').value, $('tripTime').value, { durationMinutes: estimateState.durationMinutes, trafficDurationMinutes: estimateState.trafficDurationMinutes });
            renderFareEstimateBreakdown(
              breakdown,
              estimateState.miles,
              estimateState.durationText || '-',
              estimateState.durationMinutes,
              estimateState.trafficDurationMinutes
            );
          }
          if(id === 'appointmentTime') applyPickupEstimateFromAppointment();
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
      if(!bookingSubmitted){
        window.nexusTrack?.('booking_abandoned', { step: currentDraftStep().toLowerCase() });
        const phone=formatPhone(String($('phone')?.value||''));
        if(phone.replace(/\D/g,'').length===10){
          const payload=JSON.stringify({draftToken:bookingDraftToken,name:String($('name')?.value||'').trim(),phone,email:String($('email')?.value||'').trim(),currentStep:currentDraftStep()});
          try{navigator.sendBeacon('/api/booking-drafts',new Blob([payload],{type:'application/json'}));}catch{}
        }
      }
    });
    // Optional map services must not block the section controls or checkout return.
    void initAddressAutocomplete();
    void initTelemetry();
    await restoreCheckoutBooking();
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
