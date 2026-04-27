import React, { useState, useEffect } from 'react';
import api from '../../api';
import { Card, Button } from '../../components/UI';
import CustomSelect from '../../components/CustomSelect';

const BookingForm = ({ onBooked }) => {
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    name: '', phone: '', department: '', doctorId: '',
    date: new Date().toISOString().split('T')[0],
    slot: '', reason: ''
  });

  useEffect(() => {
    api.get('/doctors/departments').then(res => { if (res.success) setDepartments(res.data); });
  }, []);

  useEffect(() => {
    if (formData.department) {
      api.get(`/doctors/by-dept/${encodeURIComponent(formData.department)}`).then(res => { if (res.success) setDoctors(res.data); });
    } else setDoctors([]);
    setFormData(prev => ({ ...prev, doctorId: '', slot: '' }));
  }, [formData.department]);

  useEffect(() => {
    if (formData.doctorId && formData.date) {
      api.get(`/doctors/${formData.doctorId}/slots?date=${formData.date}`).then(res => { if (res.success) setSlots(res.data); });
    } else setSlots([]);
    setFormData(prev => ({ ...prev, slot: '' }));
  }, [formData.doctorId, formData.date]);

  const handleBook = async () => {
    setLoading(true);
    try {
      const res = await api.post('/appointments', {
        patient_name: formData.name, patient_phone: formData.phone,
        doctor_id: parseInt(formData.doctorId), appt_date: formData.date,
        time_slot: formData.slot, reason: formData.reason
      });
      if (res.success) setSuccess(res.data);
    } catch (err) { alert(err.error || 'Booking failed'); } finally { setLoading(false); }
  };

  const formatDr = (name) => name.toLowerCase().startsWith('dr') ? name : `Dr. ${name}`;
  const formatRoom = (room) => room.toString().toLowerCase().startsWith('room') ? room : `Room ${room}`;

  if (success) {
    return (
      <div className="animate-in">
        <Card className="p-8 text-center" style={{ border: '1px solid #ECFDF5', background: '#F0FDFA' }}>
          <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl shadow-lg">✓</div>
          <h2 className="heading">Confirmed!</h2>
          <p className="subtitle mb-8">Reservation Completed</p>
          
          <div className="bg-white rounded-2xl p-6 mb-8 text-center shadow-sm" style={{ border: '1px solid #E5E9EB' }}>
             <p className="subtitle" style={{ marginBottom: '8px' }}>Your Token</p>
             <p className="text-4xl font-bold text-teal-600 mb-6 tracking-tight">{success.token}</p>
             <div className="pt-6 font-bold" style={{ borderTop: '1px solid #F1F5F9' }}>
               <p className="text-sm text-gray-900">{formatDr(success.doctor_name)}</p>
               <p className="subtitle mt-1" style={{ fontSize: '8px' }}>{success.time_slot} • {success.department}</p>
             </div>
          </div>
          <Button onClick={() => window.location.reload()} className="w-full">Track My Turn</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-in">
       <div className="text-center mb-8">
        <h2 className="heading">New Booking</h2>
        <p className="subtitle">Choose specialty and time</p>
      </div>

      <Card>
        <div className="flex-col gap-6">
          <div className="input-group">
            <label className="input-label">Department</label>
            <CustomSelect 
              options={departments.map(d => ({ value: d, label: d }))}
              value={formData.department}
              onChange={(val) => setFormData(p => ({ ...p, department: val }))}
              placeholder="— Select Specialty —"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Assign Specialist</label>
            <CustomSelect 
              options={doctors.map(d => ({ value: d.id, label: `${formatDr(d.name)} (${formatRoom(d.room)})` }))}
              value={formData.doctorId}
              disabled={!formData.department}
              onChange={(val) => setFormData(p => ({ ...p, doctorId: val }))}
              placeholder="— Select Doctor —"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Consultation Date</label>
            <input type="date" value={formData.date} min={new Date().toISOString().split('T')[0]} onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))} className="input-sleek" />
          </div>

          <div className="input-group">
            <label className="input-label">Available Time</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {slots.length > 0 ? slots.map((s, i) => (
                <button key={i} onClick={() => s.available && setFormData(prev => ({ ...prev, slot: s.time }))} disabled={!s.available}
                  className={`time-slot ${formData.slot === s.time ? 'active' : ''} ${!s.available ? 'disabled' : ''}`}
                > {s.time} </button>
              )) : <p className="col-span-3 subtitle italic py-4">Choose doctor to see slots</p>}
            </div>
          </div>

          <div className="pt-6 border-t border-gray-50 mb-8" style={{ marginTop: '20px' }}>
            <label className="input-label">Patient Info</label>
            <input type="text" placeholder="Full Patient Name" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className="input-sleek" />
            <input type="tel" placeholder="Mobile Number" value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} className="input-sleek" />
          </div>

          <div className="mt-8">
             <Button disabled={loading || !formData.slot || !formData.name || !formData.phone} onClick={handleBook}>
               {loading ? 'Confirming...' : 'Book My Turn →'}
             </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BookingForm;
