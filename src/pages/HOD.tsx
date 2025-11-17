import React, { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { toast } from "sonner";

const API_BASE_URL = window.location.origin;

// HOD-allowed emails (frontend)
const HOD_EMAILS = new Set(
  [
    "aarnav.singh@premierenergies.com",
    "pulkit@premierenergies.com",
    "karthikeyan.m@premierenergies.com",
    "vishnu.hazari@premierenergies.com",
    "taranjeet.a@premierenergies.com",
  ].map((e) => e.toLowerCase())
);

type MepTicket = {
  ticket_number: string;
  empid: number | null;
  empemail: string;
  dept: string | null;
  subdept: string | null;
  emplocation: string | null;
  designation: string | null;
  hod: string | null;
  creation_datetime: string;
  location: string;
  category: string;
  area_of_work: string | null;
  attachments: any | null;
  description: string | null;
  status: string;
  feedback: string | null;
  assignee_email: string;
};

type VrTicket = {
  ticket_number: string;
  hod: string | null;
  creation_datetime: string;
  number_of_people: number;
  employee_or_guest: "employee" | "guest";
  names: string[] | string | null;
  pickup_datetime: string;
  drop_datetime: string;
  contact_number: string;
  purpose_of_visit: string | null;
  driver_name: string | null;
  driver_number: string | null;
  assignee_email: string;
  feedback: string | null;
  status: string;
  description: string | null;
  attachments: any | null;
  user_email: string;
};

type HodTicketsResponse = {
  mepTickets: MepTicket[];
  vrTickets: VrTicket[];
};

function exportToCsv(filename: string, rows: any[]) {
  if (!rows || rows.length === 0) {
    toast.error("No data to export");
    return;
  }

  const headers = Object.keys(rows[0]);
  const escapeCell = (value: any): string => {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      return `"${value.join("; ").replace(/"/g, '""')}"`;
    }
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];
  lines.push(headers.join(","));
  for (const row of rows) {
    const line = headers.map((h) => escapeCell((row as any)[h])).join(",");
    lines.push(line);
  }

  const csvContent = lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Simple color palette for charts
const PIE_COLORS = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#06b6d4"];

const STATUS_COLORS: Record<string, string> = {
  pending_manager: "#6366f1",
  pending: "#f97316",
  in_progress: "#eab308",
  completed: "#22c55e",
  rejected: "#ef4444",
};

const HOD: React.FC = () => {
  const { userEmail, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [mepTickets, setMepTickets] = useState<MepTicket[]>([]);
  const [vrTickets, setVrTickets] = useState<VrTicket[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [mepStatusFilter, setMepStatusFilter] = useState<string>("all");
  const [mepSearch, setMepSearch] = useState<string>("");
  const [vrStatusFilter, setVrStatusFilter] = useState<string>("all");
  const [vrSearch, setVrSearch] = useState<string>("");

  const isHodUser =
    !!userEmail && HOD_EMAILS.has(userEmail.toLowerCase().trim());

  useEffect(() => {
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isHodUser) {
      // Not authorized – just show message, no fetch
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/hod/tickets`, {
          credentials: "include",
        });

        if (res.status === 401) {
          toast.error("Session expired, please log in again.");
          await logout();
          navigate("/login", { replace: true });
          return;
        }

        if (res.status === 403) {
          setError("You are not authorized to view HOD analytics.");
          return;
        }

        if (!res.ok) {
          let message = "Failed to load HOD analytics";
          try {
            const data = await res.json();
            if (data && data.error) message = data.error;
          } catch {
            // ignore
          }
          setError(message);
          toast.error(message);
          return;
        }

        const data = (await res.json()) as HodTicketsResponse;
        setMepTickets(data.mepTickets || []);
        setVrTickets(data.vrTickets || []);
      } catch (err) {
        console.error("Error fetching HOD tickets:", err);
        setError("Failed to load HOD analytics");
        toast.error("Failed to load HOD analytics");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userEmail, isHodUser, logout, navigate]);

  const filteredMep = useMemo(() => {
    let rows = [...mepTickets];
    if (mepStatusFilter !== "all") {
      rows = rows.filter(
        (r) => r.status.toLowerCase() === mepStatusFilter.toLowerCase()
      );
    }
    if (mepSearch.trim()) {
      const q = mepSearch.trim().toLowerCase();
      rows = rows.filter((r) => {
        return (
          r.ticket_number.toLowerCase().includes(q) ||
          (r.location || "").toLowerCase().includes(q) ||
          (r.category || "").toLowerCase().includes(q) ||
          (r.empemail || "").toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [mepTickets, mepStatusFilter, mepSearch]);

  const filteredVr = useMemo(() => {
    let rows = [...vrTickets];
    if (vrStatusFilter !== "all") {
      rows = rows.filter(
        (r) => r.status.toLowerCase() === vrStatusFilter.toLowerCase()
      );
    }
    if (vrSearch.trim()) {
      const q = vrSearch.trim().toLowerCase();
      rows = rows.filter((r) => {
        const namesStr = Array.isArray(r.names)
          ? r.names.join(", ")
          : (r.names as string) || "";
        return (
          r.ticket_number.toLowerCase().includes(q) ||
          (r.employee_or_guest || "").toLowerCase().includes(q) ||
          (r.user_email || "").toLowerCase().includes(q) ||
          namesStr.toLowerCase().includes(q) ||
          (r.purpose_of_visit || "").toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [vrTickets, vrStatusFilter, vrSearch]);

  // Summary metrics
  const mepSummary = useMemo(() => {
    const total = mepTickets.length;
    const pending = mepTickets.filter((t) =>
      ["pending"].includes(t.status.toLowerCase())
    ).length;
    const inProgress = mepTickets.filter(
      (t) => t.status.toLowerCase() === "in_progress"
    ).length;
    const completed = mepTickets.filter(
      (t) => t.status.toLowerCase() === "completed"
    ).length;
    const rejected = mepTickets.filter(
      (t) => t.status.toLowerCase() === "rejected"
    ).length;
    return { total, pending, inProgress, completed, rejected };
  }, [mepTickets]);

  const vrSummary = useMemo(() => {
    const total = vrTickets.length;
    const pendingManager = vrTickets.filter(
      (t) => t.status.toLowerCase() === "pending_manager"
    ).length;
    const pending = vrTickets.filter(
      (t) => t.status.toLowerCase() === "pending"
    ).length;
    const inProgress = vrTickets.filter(
      (t) => t.status.toLowerCase() === "in_progress"
    ).length;
    const completed = vrTickets.filter(
      (t) => t.status.toLowerCase() === "completed"
    ).length;
    const rejected = vrTickets.filter(
      (t) => t.status.toLowerCase() === "rejected"
    ).length;
    return { total, pendingManager, pending, inProgress, completed, rejected };
  }, [vrTickets]);

  // Charts data
  const mepByLocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of mepTickets) {
      const key = t.location || "Unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([location, count]) => ({
      location,
      count,
    }));
  }, [mepTickets]);

  const vrByType = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of vrTickets) {
      const key = t.employee_or_guest || "unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([type, count]) => ({
      type,
      count,
    }));
  }, [vrTickets]);

  // NEW: Status breakdown charts
  const mepByStatus = useMemo(
    () => [
      { label: "Pending", key: "pending", count: mepSummary.pending },
      {
        label: "In Progress",
        key: "in_progress",
        count: mepSummary.inProgress,
      },
      { label: "Completed", key: "completed", count: mepSummary.completed },
      { label: "Rejected", key: "rejected", count: mepSummary.rejected },
    ],
    [mepSummary]
  );

  const vrByStatus = useMemo(
    () => [
      {
        label: "Pending (Manager)",
        key: "pending_manager",
        count: vrSummary.pendingManager,
      },
      {
        label: "Pending (Transport)",
        key: "pending",
        count: vrSummary.pending,
      },
      {
        label: "In Progress",
        key: "in_progress",
        count: vrSummary.inProgress,
      },
      { label: "Completed", key: "completed", count: vrSummary.completed },
      { label: "Rejected", key: "rejected", count: vrSummary.rejected },
    ],
    [vrSummary]
  );

  const handleExportMep = () => {
    exportToCsv("mep_tickets_hod.csv", mepTickets);
  };

  const handleExportVr = () => {
    // Normalize names array to string for CSV
    const normalized = vrTickets.map((t) => ({
      ...t,
      names: Array.isArray(t.names) ? t.names.join("; ") : t.names,
    }));
    exportToCsv("vr_tickets_hod.csv", normalized);
  };

  if (!userEmail) {
    return null;
  }

  return (
    <Layout>
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>HOD Analytics Dashboard</CardTitle>
            <p className="text-sm text-muted-foreground">
              Logged in as <span className="font-mono">{userEmail}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              Logout
            </Button>
          </div>
        </CardHeader>
      </Card>

      {!isHodUser && (
        <Card>
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You are not authorized to view the HOD analytics dashboard.
            </p>
          </CardContent>
        </Card>
      )}

      {isHodUser && (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">MEP – Total</p>
                <p className="text-2xl font-semibold">{mepSummary.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">MEP – Pending</p>
                <p className="text-2xl font-semibold">
                  {mepSummary.pending + mepSummary.inProgress}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">MEP – Completed</p>
                <p className="text-2xl font-semibold">{mepSummary.completed}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">VR – Total</p>
                <p className="text-2xl font-semibold">{vrSummary.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  VR – Pending (Mgr + Trans)
                </p>
                <p className="text-2xl font-semibold">
                  {vrSummary.pendingManager + vrSummary.pending}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">VR – Completed</p>
                <p className="text-2xl font-semibold">{vrSummary.completed}</p>
              </div>
            </CardContent>
          </Card>

          {/* ROW 1: Location + Employee vs Guest */}
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">
                  MEP Tickets by Location
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mepByLocation}>
                    <XAxis dataKey="location" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="count"
                      name="Tickets"
                      fill="#6366f1" // Indigo
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">
                  VR Requests – Employee vs Guest
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={vrByType}
                      dataKey="count"
                      nameKey="type"
                      outerRadius={80}
                      label
                    >
                      {vrByType.map((entry, index) => (
                        <Cell
                          key={`vr-type-${entry.type}-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ROW 2: Status breakdown charts */}
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">
                  MEP Tickets by Status
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mepByStatus}>
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="Tickets">
                      {mepByStatus.map((entry, index) => (
                        <Cell
                          key={`mep-status-${entry.key}-${index}`}
                          fill={STATUS_COLORS[entry.key] || "#64748b"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">
                  VR Requests by Status
                </CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vrByStatus}>
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="Requests">
                      {vrByStatus.map((entry, index) => (
                        <Cell
                          key={`vr-status-${entry.key}-${index}`}
                          fill={STATUS_COLORS[entry.key] || "#64748b"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>MEP Tickets (All)</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by ticket, location, category, user…"
                  className="w-64"
                  value={mepSearch}
                  onChange={(e) => setMepSearch(e.target.value)}
                />
                <Select
                  value={mepStatusFilter}
                  onValueChange={(v) => setMepStatusFilter(v)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExportMep}>
                  Export MEP CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {!loading && error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              {!loading && !error && filteredMep.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No MEP tickets found for current filters.
                </p>
              )}
              {!loading && !error && filteredMep.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Ticket #</th>
                        <th className="text-left py-2 px-2">Created</th>
                        <th className="text-left py-2 px-2">Emp Email</th>
                        <th className="text-left py-2 px-2">Dept</th>
                        <th className="text-left py-2 px-2">Location</th>
                        <th className="text-left py-2 px-2">Category</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Assignee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMep.map((t) => (
                        <tr key={t.ticket_number} className="border-b">
                          <td className="py-2 px-2 font-mono text-xs">
                            {t.ticket_number}
                          </td>
                          <td className="py-2 px-2">
                            {new Date(t.creation_datetime).toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-xs">{t.empemail}</td>
                          <td className="py-2 px-2 text-xs">{t.dept || "-"}</td>
                          <td className="py-2 px-2">{t.location || "-"}</td>
                          <td className="py-2 px-2">{t.category || "-"}</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline">{t.status}</Badge>
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {t.assignee_email}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Vehicle Requests (All)</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by ticket, user, visitor names…"
                  className="w-64"
                  value={vrSearch}
                  onChange={(e) => setVrSearch(e.target.value)}
                />
                <Select
                  value={vrStatusFilter}
                  onValueChange={(v) => setVrStatusFilter(v)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending_manager">
                      Pending (Manager)
                    </SelectItem>
                    <SelectItem value="pending">Pending (Transport)</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleExportVr}>
                  Export VR CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {!loading && error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              {!loading && !error && filteredVr.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No VR tickets found for current filters.
                </p>
              )}
              {!loading && !error && filteredVr.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Ticket #</th>
                        <th className="text-left py-2 px-2">Created</th>
                        <th className="text-left py-2 px-2">User</th>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-left py-2 px-2">People</th>
                        <th className="text-left py-2 px-2">Pickup</th>
                        <th className="text-left py-2 px-2">Drop</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Assignee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVr.map((t) => (
                        <tr key={t.ticket_number} className="border-b">
                          <td className="py-2 px-2 font-mono text-xs">
                            {t.ticket_number}
                          </td>
                          <td className="py-2 px-2">
                            {new Date(t.creation_datetime).toLocaleString()}
                          </td>
                          <td className="py-2 px-2 text-xs">{t.user_email}</td>
                          <td className="py-2 px-2 capitalize">
                            {t.employee_or_guest}
                          </td>
                          <td className="py-2 px-2">{t.number_of_people}</td>
                          <td className="py-2 px-2">
                            {new Date(t.pickup_datetime).toLocaleString()}
                          </td>
                          <td className="py-2 px-2">
                            {new Date(t.drop_datetime).toLocaleString()}
                          </td>
                          <td className="py-2 px-2">
                            <Badge variant="outline">{t.status}</Badge>
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {t.assignee_email}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Layout>
  );
};

export default HOD;
