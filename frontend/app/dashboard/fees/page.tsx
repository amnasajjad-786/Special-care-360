"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { studentsDb } from "@/lib/firestore-api";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import {
  Receipt,
  Calendar,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  Printer,
  ChevronRight,
  FileText
} from "lucide-react";

interface Invoice {
  id: string;
  studentName: string;
  amount: number;
  month: string;
  issued: string;
  status: "paid" | "pending" | "overdue";
  centerId: string;
}

interface Payment {
  id: string;
  studentName: string;
  amount: number;
  method: string;
  date: string;
  recordedBy: string;
  centerId: string;
}

export default function ParentFeesPage() {
  const { profile } = useAuth();
  
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null);
  
  const selectedChildName = useMemo(() => {
    return children.find(c => c.id === selectedChildId)?.name || "";
  }, [selectedChildId, children]);

  // Load Parent's Children
  useEffect(() => {
    if (!profile) return;
    const loadParentChildren = async () => {
      setLoading(true);
      try {
        const res = await studentsDb.list(profile.centerId ?? "center-001", profile.role, profile.uid);
        setChildren(res);
        if (res.length > 0) {
          setSelectedChildId(res[0].id);
        }
      } catch (err) {
        console.error("Failed to load children in fees:", err);
        toast.error("Failed to load child accounts.");
      } finally {
        setLoading(false);
      }
    };
    loadParentChildren();
  }, [profile]);

  // Live Query Invoices & Payments for selected child
  useEffect(() => {
    if (!selectedChildId || !profile) return;
    const childName = selectedChildName;
    if (!childName) return;

    try {
      const qInvoices = query(
        collection(db, "invoices"),
        where("studentName", "==", childName),
        where("centerId", "==", profile.centerId || "center-001")
      );
      const unsubInvoices = onSnapshot(qInvoices, (snap) => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setInvoices(list);
        
        // Find latest invoice (e.g. pending/overdue, or just the most recent issued)
        const unpaid = list.find(i => i.status === "overdue") || list.find(i => i.status === "pending") || list[0] || null;
        setActiveInvoice(unpaid);
      }, () => {
        toast.error("Error syncing billing data.");
      });

      const qPayments = query(
        collection(db, "payments"),
        where("studentName", "==", childName),
        where("centerId", "==", profile.centerId || "center-001")
      );
      const unsubPayments = onSnapshot(qPayments, (snap) => {
        setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
      });

      return () => {
        unsubInvoices();
        unsubPayments();
      };
    } catch (err) {
      console.error(err);
    }
  }, [selectedChildId, selectedChildName, profile]);

  // Financial Stats
  const financials = useMemo(() => {
    let paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    let pendingTotal = invoices.filter(i => i.status === "pending").reduce((sum, i) => sum + i.amount, 0);
    let overdueTotal = invoices.filter(i => i.status === "overdue").reduce((sum, i) => sum + i.amount, 0);
    return { paidTotal, pendingTotal, overdueTotal };
  }, [invoices, payments]);

  // Transaction Ledger (Invoices and Payments combined chronologically)
  const ledger = useMemo(() => {
    const records: { date: string; month?: string; type: "Invoice" | "Payment"; amount: number; methodOrStatus: string; key: string }[] = [];
    
    invoices.forEach(i => {
      records.push({
        date: i.issued || "01 Jun",
        month: i.month,
        type: "Invoice",
        amount: i.amount,
        methodOrStatus: i.status,
        key: `inv-${i.id}`
      });
    });

    payments.forEach(p => {
      records.push({
        date: p.date,
        type: "Payment",
        amount: p.amount,
        methodOrStatus: p.method,
        key: `pay-${p.id}`
      });
    });

    // Sort by date/month (latest first - simplistic parse)
    return records.sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices, payments]);

  const feeStatusLabels = {
    paid: <span className="chip chip-success">Paid</span>,
    pending: <span className="chip chip-warning">Pending</span>,
    overdue: <span className="chip chip-danger">Overdue</span>
  };

  const statusBadges = {
    paid: <span className="chip chip-success" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><CheckCircle size={12} /> Paid</span>,
    pending: <span className="chip chip-warning" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Clock size={12} /> Pending</span>,
    overdue: <span className="chip chip-danger" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><AlertTriangle size={12} /> Overdue</span>
  };

  if (loading) {
    return (
      <div className="glass-card animate-fade-in" style={{ padding: "40px", textAlign: "center" }}>
        <div className="spinner" style={{ width: "40px", height: "40px", border: "4px solid rgba(123,196,196,0.2)", borderTopColor: "var(--accent-teal)", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-secondary)" }}>Loading student billings...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="glass-card animate-fade-in" style={{ padding: "60px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", color: "var(--text-secondary)", marginBottom: "16px" }}>
          <Receipt size={52} />
        </div>
        <h2 style={{ margin: 0, color: "var(--primary-dark)" }}>No Billings Available</h2>
        <p style={{ color: "var(--text-secondary)", marginTop: "8px" }}>
          There are no students associated with your parent account.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "40px" }}>
      {/* Title */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", color: "var(--primary-dark)", fontWeight: 800, margin: 0 }}>
          Fees &amp; Billing Center
        </h1>
        <p style={{ color: "var(--text-secondary)", margin: "4px 0 0 0", fontSize: "0.9rem" }}>
          View invoices, current dues, and past transaction records.
        </p>
      </div>

      {/* Child Selector (for multiple children) */}
      {children.length > 1 && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {children.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedChildId(c.id)}
              className="tab-item"
              style={{
                padding: "8px 18px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                background: selectedChildId === c.id ? "var(--accent-teal)" : "rgba(255,255,255,0.4)",
                color: selectedChildId === c.id ? "white" : "var(--text-primary)",
                fontWeight: 600,
                fontSize: "0.88rem",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Summary Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <div className="glass-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Total Payments Made</span>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(56, 161, 105, 0.12)", padding: "6px", borderRadius: "8px" }}>
              <CheckCircle size={18} style={{ color: "var(--success)" }} />
            </span>
          </div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--success)" }}>
            ₨ {financials.paidTotal.toLocaleString()}
          </h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Cleared invoice ledger</span>
        </div>

        <div className="glass-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Pending Balance</span>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(214, 158, 46, 0.15)", padding: "6px", borderRadius: "8px" }}>
              <Clock size={18} style={{ color: "var(--warning)" }} />
            </span>
          </div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--warning)" }}>
            ₨ {financials.pendingTotal.toLocaleString()}
          </h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Due this month</span>
        </div>

        <div className="glass-card" style={{ padding: "20px", border: financials.overdueTotal > 0 ? "1px solid rgba(229, 62, 62, 0.3)" : "1px solid rgba(255,255,255,0.4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: financials.overdueTotal > 0 ? "var(--danger)" : "var(--text-secondary)", textTransform: "uppercase" }}>Overdue Dues</span>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(229, 62, 62, 0.12)", padding: "6px", borderRadius: "8px" }}>
              <AlertTriangle size={18} style={{ color: "var(--danger)" }} />
            </span>
          </div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 800, margin: "10px 0 5px 0", color: "var(--danger)" }}>
            ₨ {financials.overdueTotal.toLocaleString()}
          </h2>
          <span style={{ fontSize: "0.75rem", color: financials.overdueTotal > 0 ? "var(--danger)" : "var(--text-secondary)", fontWeight: financials.overdueTotal > 0 ? 600 : 400 }}>
            {financials.overdueTotal > 0 ? "Requires immediate clearance" : "No overdue charges"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "24px", alignItems: "start" }}>
        
        {/* Left Card: Active Invoice details */}
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px", color: "var(--primary-dark)" }}>Current Active Invoice</h3>
          
          {!activeInvoice ? (
            <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
              <FileText size={40} style={{ color: "var(--text-secondary)", marginBottom: "8px", opacity: 0.6 }} />
              <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-secondary)" }}>All Invoices Cleared</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>Thank you! No current outstanding bills.</div>
            </div>
          ) : (
            <div className="glass-card animate-fade-in" style={{ padding: "24px", background: "white" }}>
              
              {/* Invoice Card Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "14px", borderBottom: "1px solid rgba(0,0,0,0.06)", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Invoice For</div>
                  <div style={{ fontWeight: 700, color: "var(--primary-dark)", fontSize: "1rem", marginTop: "2px" }}>{activeInvoice.month}</div>
                </div>
                {statusBadges[activeInvoice.status]}
              </div>

              {/* Fee Items Details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Tuition &amp; Program Fee</span>
                  <span style={{ fontWeight: 600 }}>₨ {activeInvoice.amount.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Therapy Surcharge</span>
                  <span style={{ fontWeight: 600 }}>₨ 0</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Center Amenities</span>
                  <span style={{ fontWeight: 600 }}>₨ 0</span>
                </div>
                <div style={{ height: "1px", background: "rgba(0,0,0,0.06)", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem" }}>
                  <span style={{ fontWeight: 700, color: "var(--primary-dark)" }}>Grand Total Due</span>
                  <span style={{ fontWeight: 800, color: "var(--primary-dark)" }}>₨ {activeInvoice.amount.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment instructions */}
              <div style={{ padding: "12px", background: "rgba(61,79,107,0.04)", borderRadius: "8px", border: "1px solid rgba(61,79,107,0.08)", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "20px" }}>
                <strong>Bank Transfer Instructions:</strong><br />
                Al-Habib Bank · Account #1024-5589-32<br />
                Please share transaction receipt with administrator.
              </div>

              {/* Action bar */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="btn-ghost"
                  onClick={() => window.print()}
                  style={{ flex: 1, padding: "10px", fontSize: "0.82rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <Printer size={14} /> Print Invoice
                </button>
                {activeInvoice.status !== "paid" && (
                  <button
                    className="btn-primary"
                    onClick={() => toast.success("Payment options integration pending bank verification.")}
                    style={{ flex: 2, padding: "10px", fontSize: "0.82rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <CreditCard size={14} /> Pay Now
                  </button>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Right Ledger: Fee Transaction History */}
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "16px", color: "var(--primary-dark)" }}>Fee Transaction History</h3>
          
          <div className="glass-card" style={{ padding: "20px", overflow: "hidden" }}>
            {ledger.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                No past transactions recorded.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.01)" }}>
                      <th style={{ padding: "10px 8px", fontSize: "0.75rem", textAlign: "left" }}>Date / Issue</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.75rem", textAlign: "left" }}>Transaction Type</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.75rem", textAlign: "right" }}>Amount</th>
                      <th style={{ padding: "10px 8px", fontSize: "0.75rem", textAlign: "right" }}>Payment / Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((item) => (
                      <tr key={item.key} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                        <td style={{ padding: "10px 8px", fontSize: "0.8rem", fontWeight: 600 }}>
                          {item.type === "Invoice" ? `${item.date} (${item.month})` : item.date}
                        </td>
                        <td style={{ padding: "10px 8px", fontSize: "0.8rem" }}>
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700,
                            background: item.type === "Invoice" ? "rgba(61,79,107,0.08)" : "rgba(56, 161, 105, 0.08)",
                            color: item.type === "Invoice" ? "var(--primary-dark)" : "var(--success)"
                          }}>
                            {item.type}
                          </span>
                        </td>
                        <td style={{ padding: "10px 8px", fontSize: "0.82rem", fontWeight: 700, textAlign: "right", color: item.type === "Invoice" ? "var(--text-primary)" : "var(--success)" }}>
                          {item.type === "Payment" ? "-" : ""}₨ {item.amount.toLocaleString()}
                        </td>
                        <td style={{ padding: "10px 8px", fontSize: "0.78rem", textAlign: "right" }}>
                          {item.type === "Invoice" ? (
                            statusBadges[item.methodOrStatus as "paid" | "pending" | "overdue"]
                          ) : (
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Bank ({item.methodOrStatus})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}