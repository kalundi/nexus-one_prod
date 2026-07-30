(function(){
'use strict';
const STORAGE='nexusLocale';
const locales={
 'en-US':{label:'English (US)',flag:'🇺🇸'},
 'en-GB':{label:'English (UK)',flag:'🇬🇧'},
 'fr':{label:'Français',flag:'🇫🇷'},
 'es':{label:'Español',flag:'🇪🇸'}
};
const dictionary={
 'en-GB':{
  'Transportation':'Transport','Medical Transportation':'Medical Transport','Wheelchair Transportation':'Wheelchair Transport','Ambulance Transportation':'Ambulance Transport','Transportation Profile':'Transport Profile','Transportation Notes':'Transport Notes','Transportation Documents':'Transport Documents','Transportation Roster':'Transport Roster','Transportation Reports':'Transport Reports','center':'centre','Center':'Centre','Canceled':'Cancelled','canceled':'cancelled','License':'Licence','license':'licence','Program':'Programme','program':'programme','Authorized':'Authorised','authorized':'authorised','Organization':'Organisation','organization':'organisation'
 },
 fr:{
  'Home':'Accueil','Services':'Services','Patient Experience':'Expérience patient','Experience':'Expérience','Coverage':'Zone desservie','Facilities':'Établissements','Safety & Quality':'Sécurité et qualité','Assurance':'Assurance','Livecare':'Livecare','Book a Ride':'Réserver un trajet','Call Nexus':'Appeler Nexus','Facility Solutions':'Solutions pour établissements','Skip to main content':'Aller au contenu principal','Open navigation menu':'Ouvrir le menu de navigation','Close navigation menu':'Fermer le menu de navigation','Requests open':'Demandes ouvertes','Care in motion':'Des soins en mouvement','Previous slide':'Diapositive précédente','Next slide':'Diapositive suivante','Pause':'Pause','Play':'Lecture','English (US)':'Anglais (É.-U.)','English (UK)':'Anglais (R.-U.)','French':'Français','Spanish':'Espagnol','Language':'Langue','Select language':'Choisir la langue','Dashboard':'Tableau de bord','Patient Portal':'Portail patient','Facility Portal':'Portail établissement','Dispatch':'Répartition','Fleet':'Flotte','Driver':'Chauffeur','Executive':'Direction','Billing':'Facturation','Admin':'Administration','Quality Assurance':'Assurance qualité','AI Operations':'Opérations IA','Sign in':'Se connecter','Sign out':'Se déconnecter','Email':'Courriel','Password':'Mot de passe','Submit':'Envoyer','Save':'Enregistrer','Cancel':'Annuler','Close':'Fermer','Search':'Rechercher','Status':'Statut','Date':'Date','Time':'Heure','Pickup':'Prise en charge','Destination':'Destination','Patient':'Patient','Driver Assignment':'Affectation du chauffeur','Vehicle':'Véhicule','Available':'Disponible','Unavailable':'Indisponible','Scheduled':'Planifié','Assigned':'Affecté','En Route':'En route','Arrived':'Arrivé','Loaded':'À bord','In Transit':'En transport','Completed':'Terminé','Billed':'Facturé','Paid':'Payé','Invoice':'Facture','Claims':'Demandes de remboursement','Payments':'Paiements','Revenue':'Revenus','Accounts Receivable':'Comptes clients','Reports':'Rapports','Settings':'Paramètres','Configuration Center':'Centre de configuration','Service Types':'Types de service','Business Hours':'Heures d’ouverture','Holidays':'Jours fériés','Service Zones':'Zones de service','Payment Providers':'Fournisseurs de paiement','Wheelchair':'Fauteuil roulant','Stretcher':'Civière','Ambulatory':'Ambulatoire','Bariatric':'Bariatrique','Ambulance':'Ambulance','Medical Shuttle':'Navette médicale','Dialysis & Recurring Trips':'Dialyse et trajets récurrents','Hospital Discharge':'Sortie d’hôpital','Door-through-door support':'Assistance porte à porte','Multilingual assistance':'Assistance multilingue','Accessible fleet options':'Options de flotte accessible','Every medical journey deserves':'Chaque trajet médical mérite','care, clarity and dignity.':'soins, clarté et dignité.','Nexus Medical Transit delivers accessible wheelchair, stretcher, shuttle and ambulance transportation throughout Maryland, Washington, DC and Northern Virginia.':'Nexus Medical Transit fournit des transports accessibles en fauteuil roulant, civière, navette et ambulance dans le Maryland, Washington D.C. et le nord de la Virginie.','Track status and ETA':'Suivre le statut et l’heure d’arrivée','Schedule & manage rides':'Planifier et gérer les trajets','Invoices & reports':'Factures et rapports','Facility user controls':'Gestion des utilisateurs de l’établissement','Request':'Demande','Coordinate':'Coordination','Stay informed':'Rester informé','Arrive safely':'Arriver en sécurité','Emergency Contact':'Contact d’urgence','Notifications':'Notifications','Ride History':'Historique des trajets','Upcoming Trips':'Trajets à venir','Completed Trips':'Trajets terminés','Live trip map':'Carte du trajet en direct','Send message':'Envoyer un message','Start Shift':'Commencer le quart','End Shift':'Terminer le quart','Pre-trip Inspection':'Inspection avant trajet','Incident Report':'Rapport d’incident','Maintenance':'Entretien','Fuel':'Carburant','Operations Health Score':'Indice de santé opérationnelle','Fleet Utilization':'Utilisation de la flotte','On-Time Performance':'Ponctualité','Active Trips':'Trajets actifs','Gross Revenue':'Revenus bruts','Outstanding Balance':'Solde impayé','Export CSV':'Exporter CSV','Print':'Imprimer','Book Transportation':'Réserver un transport','Track a Request':'Suivre une demande','Healthcare Partners':'Partenaires de santé','Patients & Families':'Patients et familles','Contact':'Contact','For emergencies, call 911.':'En cas d’urgence, appelez le 911.','Accessibility':'Accessibilité','Larger text':'Texte plus grand','High contrast':'Contraste élevé','Reduce motion':'Réduire les animations','Open Section 508 accessibility options':'Ouvrir les options d’accessibilité Section 508','Close Section 508 accessibility options':'Fermer les options d’accessibilité Section 508','Wheelchair Transportation':'Transport en fauteuil roulant','Stretcher & Bariatric':'Civière et bariatrique','Ambulance Services':'Services d’ambulance','Private accessible transport':'Transport accessible privé','Non-emergency support':'Assistance non urgente','Medical transport':'Transport médical','Facility mobility':'Mobilité des établissements','Compassionate, timely and inclusive healthcare mobility across the Washington Metropolitan Area.':'Mobilité médicale compatissante, ponctuelle et inclusive dans la région métropolitaine de Washington.'
 },
 es:{
  'Home':'Inicio','Services':'Servicios','Patient Experience':'Experiencia del paciente','Experience':'Experiencia','Coverage':'Cobertura','Facilities':'Centros','Safety & Quality':'Seguridad y calidad','Assurance':'Garantía','Livecare':'Livecare','Book a Ride':'Reservar un viaje','Call Nexus':'Llamar a Nexus','Facility Solutions':'Soluciones para centros','Skip to main content':'Saltar al contenido principal','Open navigation menu':'Abrir menú de navegación','Close navigation menu':'Cerrar menú de navegación','Requests open':'Solicitudes abiertas','Care in motion':'Cuidado en movimiento','Previous slide':'Diapositiva anterior','Next slide':'Diapositiva siguiente','Pause':'Pausar','Play':'Reproducir','English (US)':'Inglés (EE. UU.)','English (UK)':'Inglés (Reino Unido)','French':'Francés','Spanish':'Español','Language':'Idioma','Select language':'Seleccionar idioma','Dashboard':'Panel','Patient Portal':'Portal del paciente','Facility Portal':'Portal del centro','Dispatch':'Despacho','Fleet':'Flota','Driver':'Conductor','Executive':'Ejecutivo','Billing':'Facturación','Admin':'Administración','Quality Assurance':'Control de calidad','AI Operations':'Operaciones con IA','Sign in':'Iniciar sesión','Sign out':'Cerrar sesión','Email':'Correo electrónico','Password':'Contraseña','Submit':'Enviar','Save':'Guardar','Cancel':'Cancelar','Close':'Cerrar','Search':'Buscar','Status':'Estado','Date':'Fecha','Time':'Hora','Pickup':'Recogida','Destination':'Destino','Patient':'Paciente','Driver Assignment':'Asignación de conductor','Vehicle':'Vehículo','Available':'Disponible','Unavailable':'No disponible','Scheduled':'Programado','Assigned':'Asignado','En Route':'En camino','Arrived':'Llegó','Loaded':'A bordo','In Transit':'En tránsito','Completed':'Completado','Billed':'Facturado','Paid':'Pagado','Invoice':'Factura','Claims':'Reclamaciones','Payments':'Pagos','Revenue':'Ingresos','Accounts Receivable':'Cuentas por cobrar','Reports':'Informes','Settings':'Configuración','Configuration Center':'Centro de configuración','Service Types':'Tipos de servicio','Business Hours':'Horario comercial','Holidays':'Días festivos','Service Zones':'Zonas de servicio','Payment Providers':'Proveedores de pago','Wheelchair':'Silla de ruedas','Stretcher':'Camilla','Ambulatory':'Ambulatorio','Bariatric':'Bariátrico','Ambulance':'Ambulancia','Medical Shuttle':'Transporte médico','Dialysis & Recurring Trips':'Diálisis y viajes recurrentes','Hospital Discharge':'Alta hospitalaria','Door-through-door support':'Asistencia de puerta a puerta','Multilingual assistance':'Asistencia multilingüe','Accessible fleet options':'Opciones de flota accesible','Every medical journey deserves':'Cada viaje médico merece','care, clarity and dignity.':'cuidado, claridad y dignidad.','Nexus Medical Transit delivers accessible wheelchair, stretcher, shuttle and ambulance transportation throughout Maryland, Washington, DC and Northern Virginia.':'Nexus Medical Transit ofrece transporte accesible en silla de ruedas, camilla, transporte médico y ambulancia en Maryland, Washington D. C. y el norte de Virginia.','Track status and ETA':'Seguir estado y hora estimada','Schedule & manage rides':'Programar y gestionar viajes','Invoices & reports':'Facturas e informes','Facility user controls':'Controles de usuarios del centro','Request':'Solicitud','Coordinate':'Coordinar','Stay informed':'Mantenerse informado','Arrive safely':'Llegar con seguridad','Emergency Contact':'Contacto de emergencia','Notifications':'Notificaciones','Ride History':'Historial de viajes','Upcoming Trips':'Próximos viajes','Completed Trips':'Viajes completados','Live trip map':'Mapa del viaje en vivo','Send message':'Enviar mensaje','Start Shift':'Iniciar turno','End Shift':'Finalizar turno','Pre-trip Inspection':'Inspección previa','Incident Report':'Informe de incidente','Maintenance':'Mantenimiento','Fuel':'Combustible','Operations Health Score':'Índice de salud operativa','Fleet Utilization':'Uso de la flota','On-Time Performance':'Puntualidad','Active Trips':'Viajes activos','Gross Revenue':'Ingresos brutos','Outstanding Balance':'Saldo pendiente','Export CSV':'Exportar CSV','Print':'Imprimir','Book Transportation':'Reservar transporte','Track a Request':'Seguir una solicitud','Healthcare Partners':'Socios de atención médica','Patients & Families':'Pacientes y familias','Contact':'Contacto','For emergencies, call 911.':'Para emergencias, llame al 911.','Accessibility':'Accesibilidad','Larger text':'Texto más grande','High contrast':'Alto contraste','Reduce motion':'Reducir movimiento','Open Section 508 accessibility options':'Abrir opciones de accesibilidad de la Sección 508','Close Section 508 accessibility options':'Cerrar opciones de accesibilidad de la Sección 508','Wheelchair Transportation':'Transporte en silla de ruedas','Stretcher & Bariatric':'Camilla y bariátrico','Ambulance Services':'Servicios de ambulancia','Private accessible transport':'Transporte accesible privado','Non-emergency support':'Apoyo no urgente','Medical transport':'Transporte médico','Facility mobility':'Movilidad para centros','Compassionate, timely and inclusive healthcare mobility across the Washington Metropolitan Area.':'Movilidad médica compasiva, puntual e inclusiva en el área metropolitana de Washington.'
 }
};
let locale=localStorage.getItem(STORAGE)||'en-US';
if(!locales[locale]) locale='en-US';
const originals=new WeakMap();
const originalAttributes=new WeakMap();
const originalTitle=document.title;
function exact(value){const map=dictionary[locale]||{};return map[value]||value;}
function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function translateText(text){
 const lead=text.match(/^\s*/)[0],trail=text.match(/\s*$/)[0],core=text.trim();
 if(!core)return text;
 const map=dictionary[locale]||{};
 let out=map[core]||core;
 // Translate known phrases inside longer labels and sentences. Longest phrases run first.
 if(out===core && locale!=='en-US'){
  Object.keys(map).sort((a,b)=>b.length-a.length).forEach(key=>{
   if(!key || key.length<3)return;
   out=out.replace(new RegExp(escapeRegExp(key),'g'),map[key]);
  });
 }
 return lead+out+trail;
}
function translateNode(node){
 if(node.nodeType===3){
  if(!originals.has(node)) originals.set(node,node.nodeValue);
  node.nodeValue=translateText(originals.get(node)); return;
 }
 if(node.nodeType!==1||['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA'].includes(node.tagName))return;
 ['aria-label','title','placeholder','value'].forEach(a=>{
  if(node.hasAttribute(a)){
   let attrs=originalAttributes.get(node);
   if(!attrs){attrs={};originalAttributes.set(node,attrs);}
   if(!(a in attrs)) attrs[a]=node.getAttribute(a);
   node.setAttribute(a,translateText(attrs[a]));
  }
 });
 node.childNodes.forEach(translateNode);
}
function apply(root=document.body){
 document.documentElement.lang=locale;
 document.documentElement.dataset.locale=locale;
 document.title=translateText(originalTitle);
 if(root)translateNode(root);
 document.querySelectorAll('[data-nexus-language]').forEach(s=>s.value=locale);
 window.dispatchEvent(new CustomEvent('nexus:localechange',{detail:{locale}}));
 const live=document.getElementById('nexus-language-status');if(live)live.textContent=(locales[locale]?.label||locale)+' selected';
}
function setLocale(next){if(!locales[next])return;locale=next;localStorage.setItem(STORAGE,next);try{apply();}catch(error){console.error('NEXUS language switch failed:',error);document.documentElement.lang=locale;document.documentElement.dataset.locale=locale;}}
function addSelector(){
 if(document.querySelector('[data-nexus-language]'))return;
 const wrap=document.createElement('div');wrap.className='nexusLanguageControl';wrap.setAttribute('role','group');wrap.setAttribute('aria-label','Language');
 const label=document.createElement('label');label.className='srOnly';label.htmlFor='nexus-language';label.textContent='Select language';
 const select=document.createElement('select');select.id='nexus-language';select.setAttribute('data-nexus-language','');select.setAttribute('aria-label','Select language');
 Object.entries(locales).forEach(([code,x])=>{const o=document.createElement('option');o.value=code;o.textContent=`${x.flag} ${x.label}`;select.append(o)});
 select.value=locale;select.addEventListener('change',e=>setLocale(e.target.value));const status=document.createElement('span');status.id='nexus-language-status';status.className='srOnly';status.setAttribute('aria-live','polite');wrap.append(label,select,status);
 const headerTarget=document.querySelector('.navRight')||document.querySelector('header .nav')||document.querySelector('header .shell')||document.body;
 if(headerTarget!==document.body)wrap.classList.add('headerLanguageGlobal');
 headerTarget.append(wrap);
 }
 const observer=new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1||n.nodeType===3)translateNode(n)})));
 function bindSelectors(){document.querySelectorAll('[data-nexus-language]').forEach(select=>{if(select.dataset.nexusBound)return;select.dataset.nexusBound='true';select.addEventListener('change',e=>setLocale(e.target.value));});}
 function init(){addSelector();bindSelectors();apply();observer.observe(document.body,{childList:true,subtree:true});}
 window.NexusI18n={setLocale,getLocale:()=>locale,locales,t:(s)=>exact(s),formatCurrency:(n,c='USD')=>new Intl.NumberFormat(locale,{style:'currency',currency:c}).format(n),formatDate:(d,o)=>new Intl.DateTimeFormat(locale,o).format(new Date(d))};
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
