(function(){
  'use strict';
  const expandedRefs=new Set();
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))
    ?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)):'—';
  const readable=value=>String(value||'').replace(/[_-]+/g,' ').toLowerCase().replace(/\b\w/g,char=>char.toUpperCase());
  const serviceLabel=value=>({als1:'ALS 1',als2:'ALS 2',bls:'BLS',broda:'Broda chair'}[String(value||'').toLowerCase()]||readable(value)||'Not specified');
  const dateLabel=value=>{
    const raw=String(value||'');
    const match=raw.match(/^(\d{4}-\d{2}-\d{2})/);
    const date=new Date(match?`${match[1]}T12:00:00`:raw);
    return Number.isNaN(date.getTime())?(raw||'Date pending'):date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  };
  const timeLabel=value=>{
    const raw=String(value||'');
    const match=raw.match(/^(\d{1,2}):(\d{2})$/);
    if(!match) return raw||'Time pending';
    const hour=Number(match[1]);
    return `${hour%12||12}:${match[2]} ${hour>=12?'PM':'AM'}`;
  };
  const field=(label,value)=>`<div><dt>${escape(label)}</dt><dd>${escape(value||'Not provided')}</dd></div>`;
  const statusText=trip=>String(trip.statusLabel||trip.status||'Requested').replace(/[_-]+/g,' ').trim();
  const compactStatus=trip=>{
    const full=statusText(trip);
    const key=full.toLowerCase().replace(/\s+/g,' ');
    return ({'pending dispatch confirmation':'Needs dispatch','pending confirmation':'Needs confirmation','in transit':'In transit','en route':'En route','mock':'MOCK TRIP'}[key]||readable(full));
  };
  const statusTone=trip=>{
    const key=String(trip.status||'').toLowerCase().replace(/[_\s]+/g,'-');
    if(['completed','delivered','in-transit'].includes(key))return 'green';
    if(['assigned','en-route','arrived','mock'].includes(key))return 'amber';
    if(['cancelled','canceled','declined'].includes(key))return 'red';
    return 'blue';
  };
  function referenceCell(reference,kind,checked){
    const ref=escape(reference);
    return `<label class="tripReference"><input class="dispatch-bulk-select" data-ref="${ref}" type="checkbox" ${checked&&kind!=='MOCK'?'checked':''} ${kind==='MOCK'?'disabled':''} aria-label="Select ${ref} for bulk updates"><span class="tripReferenceText"><span class="tripTruncate" title="${ref}">${ref}</span><span class="tripSourceBadge ${kind==='REAL'?'real':'mock'}">${kind==='MOCK'?'MOCK TRIP':kind}</span></span></label>`;
  }
  function detailsMarkup(trip,ref,risk,estimate,brokerQuoted){
    const appointment=trip.submittedAppointmentTime||trip.appointmentTime;
    const pickupTime=trip.pickupTime||trip.time;
    const type=String(trip.tripType||trip.trip_type||'ONE_WAY').toUpperCase();
    const hasReturn=type==='ROUND_TRIP';
    const returnTime=trip.returnTripTime||trip.return_trip_time;
    const returnMode=String(trip.returnTripMode||trip.return_trip_mode||'').toUpperCase();
    const returnLabel=returnTime?`${dateLabel(trip.returnTripDate||trip.return_trip_date||trip.date)} · ${timeLabel(returnTime)}`:returnMode==='WILL_CALL'?'Will call':'Pickup pending';
    const parse=String(trip.intakeParseSource||trip.intakeSubmissionMethod||'');
    const fileCount=Number(trip.sourceAttachmentCount||0);
    const source=readable(trip.bookingSource||trip.booking_source||trip.source)||'Not provided';
    const driver=trip.driverName||trip.driver||'Unassigned';
    const vehicle=trip.vehicleUnit||trip.vehicle||'Unassigned';
    return `<div class="tripDetailsPanel" role="region" aria-label="Trip details for ${escape(ref)}">
      <div class="tripDetailsHeading"><strong>${escape(trip.name||'Patient not provided')}</strong><span>${escape(ref)}</span></div>
      <div class="tripDetailsGrid">
        <section><h4>Route & schedule</h4><dl class="tripDetailFields">
          <div class="tripAddress"><dt>Pickup</dt><dd>${escape(trip.pickup||'Not provided')}</dd></div><div class="tripAddress"><dt>Destination</dt><dd>${escape(trip.destination||'Not provided')}</dd></div>
          ${field('Service',serviceLabel(trip.service))}${field('Trip type',readable(type))}
          ${field('Date',String(trip.date||'').slice(0,10))}${field('Pickup time',timeLabel(pickupTime))}
          ${appointment?field('Appointment',timeLabel(appointment)):''}${hasReturn?field('Return pickup',returnLabel):''}
        </dl></section>
        <section><h4>Rates & dispatch</h4><dl class="tripDetailFields">
          ${field('Our estimate',estimate)}${field('Broker quoted',brokerQuoted)}
          ${field('Driver confirmed',money(trip.brokerAcceptedRate??trip.driverConfirmedRate??trip.broker_accepted_rate))}
          ${field('Status',statusText(trip))}${field('Driver',driver)}${field('Vehicle',vehicle)}
          ${field('Booking source',source)}${trip.brokerCompanyName?field('Broker company',trip.brokerCompanyName):''}
          ${parse?field('Intake source',readable(parse)):''}${fileCount>0?field('Attachments',`${fileCount} file${fileCount===1?'':'s'}`):''}
        </dl></section>
      </div>
      <div class="tripRiskDetails"><span class="status ${risk.level==='High'?'red':risk.level==='Medium'?'amber':'green'}">${escape(risk.level)} ${escape(risk.score)}%</span><span class="tripRiskLabel">AI delay risk</span><ul>${risk.reasons.map(reason=>`<li>${escape(reason)}</li>`).join('')}</ul></div>
      ${trip.notes?`<p class="tripDetailsNotes"><strong>Notes</strong><span>${escape(trip.notes)}</span></p>`:''}
      <div class="tripDetailsActions"><button class="tripTableButton primary" type="button" data-trip-edit="${escape(ref)}">Edit trip</button><button class="tripTableButton" type="button" data-trip-docs="${escape(ref)}">Documents</button><button class="tripTableButton danger" type="button" data-delete="${escape(ref)}">Delete trip</button></div>
    </div>`;
  }
  function renderRows(trips){
    if(!trips.length)return '<tr class="tripEmptyRow"><td colspan="9">No trips match these filters.</td></tr>';
    return trips.map((trip,index)=>{
      const ref=String(trip.reference||trip.id||'');
      const safeRef=escape(ref);
      const estimate=money(trip.ourEstimate??trip.estimatedFare??trip.estimated_fare??trip.estimate??trip.fare);
      const brokerQuoted=money(trip.brokerQuotedRate??trip.broker_quoted_rate??trip.quotedRate);
      const risk=window.NexusAI.riskScore(trip);
      const date=dateLabel(trip.date);
      const appointment=trip.submittedAppointmentTime||trip.appointmentTime;
      const time=timeLabel(appointment||trip.pickupTime||trip.time);
      const expanded=expandedRefs.has(ref);
      return `<tr class="tripSummaryRow" data-reference="${safeRef}">
        <td class="tripColReference">${safeRef}</td>
        <td class="tripColPatient"><button class="tripPatientButton tripTruncate" type="button" data-trip-edit="${safeRef}" title="Edit ${escape(trip.name||ref)}">${escape(trip.name||'Patient not provided')}</button></td>
        <td class="tripColService"><span class="tripTruncate" title="${escape(serviceLabel(trip.service))}">${escape(serviceLabel(trip.service))}</span></td>
        <td class="tripColSchedule"><span class="tripDate">${escape(date)}</span><span class="tripTime">${escape(time)}<span class="tripTimeBasis">${appointment?'Appt':'Pickup'}</span></span></td>
        <td class="tripColStatus"><span class="status ${statusTone(trip)} tripTruncate" title="${escape(statusText(trip))}">${escape(compactStatus(trip))}</span></td>
        <td class="tripColEstimate"><span class="tripMoney" title="${escape(estimate)}">${escape(estimate)}</span></td>
        <td class="tripColBroker"><span class="tripMoney" title="${escape(brokerQuoted)}">${escape(brokerQuoted)}</span></td>
        <td class="tripColRisk"><span class="status ${risk.level==='High'?'red':risk.level==='Medium'?'amber':'green'}" title="${escape(risk.level)} AI delay risk">${escape(risk.score)}%</span></td>
        <td class="tripColActions"><button class="tripTableButton tripMoreButton" type="button" data-trip-more="${safeRef}" aria-expanded="${expanded}" aria-controls="trip-details-${index}" aria-label="More details for ${safeRef}">More <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
      </tr><tr class="tripDetailsRow" data-trip-details="${safeRef}" id="trip-details-${index}" ${expanded?'':'hidden'}><td colspan="9">${detailsMarkup(trip,ref,risk,estimate,brokerQuoted)}</td></tr>`;
    }).join('');
  }
  const rows=document.getElementById('tripRows');
  rows?.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.hasAttribute('data-trip-more')){
      const ref=button.dataset.tripMore;
      const details=Array.from(rows.querySelectorAll('.tripDetailsRow')).find(row=>row.dataset.tripDetails===ref);
      if(!details)return;
      const expanded=button.getAttribute('aria-expanded')!=='true';
      button.setAttribute('aria-expanded',String(expanded));
      details.hidden=!expanded;
      if(expanded)expandedRefs.add(ref);else expandedRefs.delete(ref);
    }else if(button.hasAttribute('data-trip-edit')){
      window.openTripEditor?.(button.dataset.tripEdit);
    }else if(button.hasAttribute('data-trip-docs')){
      window.showBookingDocuments?.(button.dataset.tripDocs);
    }else if(button.hasAttribute('data-delete')){
      window.deleteTrip?.(button.dataset.delete);
    }
  });
  window.NexusTripTable={renderRows,referenceCell};
})();
