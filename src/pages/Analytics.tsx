import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const API_BASE_URL = window.location.origin;

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    mepVsVr: [] as { name: string; value: number }[],
    statusBreakdown: [] as { name: string; value: number }[],
    mepByLocation: [] as { name: string; value: number }[],
    mepByCategory: [] as { name: string; value: number }[],
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [mepRes, vrRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/mep`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/api/vr`, { credentials: "include" }),
      ]);

      if (!mepRes.ok || !vrRes.ok) {
        console.error("Error fetching analytics:", {
          mepStatus: mepRes.status,
          vrStatus: vrRes.status,
        });
        return;
      }

      const mepData = await mepRes.json();
      const vrData = await vrRes.json();

      // --- MEP vs VR ---
      const mepVsVr = [
        { name: "MEP Requests", value: mepData.length || 0 },
        { name: "Vehicle Requests", value: vrData.length || 0 },
      ];

      // --- Status Breakdown (MEP + VR) ---
      const allTickets = [...mepData, ...vrData];
      const statusCounts = allTickets.reduce((acc: any, t: any) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});
      const statusBreakdown = Object.entries(statusCounts).map(
        ([name, value]) => ({
          name: name.replace("_", " ").toUpperCase(),
          value: value as number,
        })
      );

      // --- MEP by Location ---
      const locationCounts = mepData.reduce((acc: any, t: any) => {
        acc[t.location] = (acc[t.location] || 0) + 1;
        return acc;
      }, {});
      const mepByLocation = Object.entries(locationCounts).map(
        ([name, value]) => ({
          name,
          value: value as number,
        })
      );

      // --- MEP by Category ---
      const categoryCounts = mepData.reduce((acc: any, t: any) => {
        acc[t.category] = (acc[t.category] || 0) + 1;
        return acc;
      }, {});
      const mepByCategory = Object.entries(categoryCounts).map(
        ([name, value]) => ({
          name,
          value: value as number,
        })
      );

      setStats({
        mepVsVr,
        statusBreakdown,
        mepByLocation,
        mepByCategory,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Ticketing Analytics</CardTitle>
            <CardDescription>
              Overview of all tickets and their status
            </CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center">Loading analytics...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* MEP vs VR */}
              <Card>
                <CardHeader>
                  <CardTitle>MEP vs Vehicle Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={stats.mepVsVr}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {stats.mepVsVr.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Status Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.statusBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* MEP by Location */}
              <Card>
                <CardHeader>
                  <CardTitle>MEP Requests by Location</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={stats.mepByLocation}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--accent))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* MEP by Category */}
              <Card>
                <CardHeader>
                  <CardTitle>MEP Requests by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={stats.mepByCategory}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {stats.mepByCategory.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
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
          </>
        )}
      </div>
    </Layout>
  );
}
