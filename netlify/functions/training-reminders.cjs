const {query}=require('./_shared/db.cjs');
const {notifyTrainingAdmins}=require('./_shared/training-notifications.cjs');
exports.handler=async()=>{await notifyTrainingAdmins({query});return {statusCode:200,body:'Training approval reminders processed'}};
