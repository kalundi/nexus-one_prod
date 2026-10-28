const clean=v=>String(v??'').trim();
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const relations={OPERATES:['ORGANIZATION',['FACILITY']],WORKS_FOR:['EMPLOYEE',['ORGANIZATION']],SERVES:['EMPLOYEE',['FACILITY']],CONTACT_FOR:['CONTACT',['FACILITY','ORGANIZATION']],RECEIVES_CARE_AT:['PATIENT',['FACILITY']]};
function createHandler({query,getPool,requireUser,bearer,json,parseBody}){
 async function transaction(fn){const c=await getPool().connect();try{await c.query('BEGIN');const result=await fn(c.query.bind(c));await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
 async function classify(q,id,body){
  const category=clean(body.category).toUpperCase(),subtype=clean(body.subtype||'GENERAL').toUpperCase();
  const valid=(await q('SELECT t.category FROM actor_types t JOIN actors a ON a.kind=t.kind WHERE a.id=$1 AND t.category=$2 AND t.subtype=$3',[id,category,subtype])).rows[0];
  if(!valid)fail('Choose a classification that matches this person or entity.');
  await q("INSERT INTO actor_classifications(actor_id,category,subtype) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[id,category,subtype]);
  return {category,subtype};
 }
 const recordSources=`SELECT actor_id,'USER' source,id::text record_id,display_name name FROM users UNION ALL SELECT actor_id,'EMPLOYEE',id::text,display_name FROM employees UNION ALL SELECT actor_id,'PATIENT',id::text,display_name FROM patients UNION ALL SELECT actor_id,'FACILITY',facility_code,name FROM facilities UNION ALL SELECT actor_id,'ORGANIZATION',id::text,name FROM organizations`;
 return async(event,p,method)=>{
  if(p[0]!=='admin'||p[1]!=='actors')return null;
  const me=await requireUser(bearer(event),['ADMIN']);
  const params=event.queryStringParameters||{};
  if(p.length===3&&p[2]==='types'&&method==='GET')return json(200,{types:(await query('SELECT * FROM actor_types ORDER BY category,subtype')).rows,relationships:relations});
  if(p.length===2&&method==='GET'){
   const category=clean(params.category).toUpperCase(),search=clean(params.q),page=Number(params.page||0);
   if(search.length>100||!Number.isInteger(page)||page<0||page>10000||category&&!['EMPLOYEE','PATIENT','FACILITY','ORGANIZATION','CONTACT'].includes(category))fail('Choose a valid search, category and page.');
   const rows=(await query(`SELECT a.*,COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('category',c.category,'subtype',c.subtype)) FROM actor_classifications c WHERE c.actor_id=a.id),'[]'::jsonb) classifications FROM actors a WHERE ($1='' OR position(lower($1) in lower(a.display_name))>0) AND ($2='' OR EXISTS(SELECT 1 FROM actor_classifications c WHERE c.actor_id=a.id AND c.category=$2)) ORDER BY lower(a.display_name),a.id LIMIT 51 OFFSET $3`,[search,category,page*50])).rows;
   return json(200,{actors:rows.slice(0,50),hasMore:rows.length>50,page});
  }
  if(p.length===2&&method==='POST'){
   const b=parseBody(event),name=clean(b.name),kind=clean(b.kind).toUpperCase();
   if(!name||name.length>250||!['PERSON','ENTITY'].includes(kind))fail('Enter a name and choose Person or Entity.');
   const actor=await transaction(async q=>{
    const row=(await q('INSERT INTO actors(kind,display_name) VALUES($1,$2) RETURNING *',[kind,name])).rows[0];
    const classification=await classify(q,row.id,b);
    await q("INSERT INTO actor_events(actor_id,performed_by,action,details) VALUES($1,$2,'CREATED',$3::jsonb)",[row.id,me.id,JSON.stringify(classification)]);
    return row;
   });return json(201,{actor});
  }
  const id=clean(p[2]);if(!uuid(id))fail('Choose a valid actor.');
  const actor=(await query('SELECT * FROM actors WHERE id=$1',[id])).rows[0];if(!actor)fail('Actor not found.',404);
  if(p.length===3&&method==='GET'){
   const [classes,links,sources]=await Promise.all([
    query('SELECT category,subtype,source FROM actor_classifications WHERE actor_id=$1 ORDER BY category,subtype,source',[id]),
    query('SELECT r.*,s.display_name subject_name,o.display_name object_name FROM actor_relationships r JOIN actors s ON s.id=r.subject_id JOIN actors o ON o.id=r.object_id WHERE r.subject_id=$1 OR r.object_id=$1 ORDER BY r.created_at DESC LIMIT 100',[id]),
    query(`SELECT source,record_id,name FROM (${recordSources}) records WHERE actor_id=$1`,[id])
   ]);return json(200,{actor,classifications:classes.rows,relationships:links.rows,records:sources.rows});
  }
  if(p.length===4&&p[3]==='classifications'&&method==='POST'){
   const result=await transaction(async q=>{
    const value=await classify(q,id,parseBody(event));await q("INSERT INTO actor_events(actor_id,performed_by,action,details) VALUES($1,$2,'CLASSIFIED',$3::jsonb)",[id,me.id,JSON.stringify(value)]);return value;
   });return json(200,{classification:result});
  }
  if(p.length===4&&p[3]==='relationships'&&method==='POST'){
   const b=parseBody(event),type=clean(b.relationship).toUpperCase(),object=clean(b.objectId);
   if(!relations[type]||!uuid(object)||id===object)fail('Choose a supported relationship and a different actor.');
   await transaction(async q=>{
    // Lock endpoints while validating classification-dependent relationships.
    const endpoints=(await q('SELECT id FROM actors WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[id,object]])).rows;
    if(endpoints.length!==2)fail('Related actor not found.',404);
    const classes=(await q('SELECT actor_id,category FROM actor_classifications WHERE actor_id=ANY($1::uuid[])',[[id,object]])).rows;
    if(!classes.some(c=>c.actor_id===id&&c.category===relations[type][0])||!classes.some(c=>c.actor_id===object&&relations[type][1].includes(c.category)))fail('This relationship does not match the selected actor classifications.');
    await q('INSERT INTO actor_relationships(subject_id,relationship,object_id,created_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,type,object,me.id]);
    await q("INSERT INTO actor_events(actor_id,performed_by,action,details) VALUES($1,$2,'RELATED',$3::jsonb)",[id,me.id,JSON.stringify({relationship:type,objectId:object})]);
   });return json(200,{saved:true});
  }
  return json(405,{error:'Method not allowed.'});
 };
}
module.exports={createHandler,relations};
