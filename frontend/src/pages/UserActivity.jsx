import React, { useMemo, useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import { Card, Row, Col, DatePicker, Button, Table, Statistic, Select, Space, message, Checkbox } from "antd";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import * as XLSX from "xlsx-js-style";
import { getUserActivity } from "../api";
const { RangePicker } = DatePicker;
const renderBarValueLabel = (props) => {
  const { x, y, width, value } = props;
  const safeValue = Number(value) || 0;
  const boxWidth = 32;
  const boxHeight = 18;
  const boxX = x + width / 2 - boxWidth / 2;
  const boxY = y - boxHeight - 6;

  return (
    <g>
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        rx={4}
        fill="#0f172a"
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <text
        x={x + width / 2}
        y={boxY + boxHeight / 2 + 4}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={11}
        fontWeight={700}
      >
        {safeValue}
      </text>
    </g>
  );
};

const UserActivity = () => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [summary, setSummary] = useState([]);
  const [totals, setTotals] = useState({ total_events: 0, total_users: 0, total_tools: 0 });
  const [userTable, setUserTable] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState("unique_users");
  const [toolView, setToolView] = useState("specific");
  const [excludeAdmin, setExcludeAdmin] = useState(true);

  const normalizeUserTable = (rows = []) =>
    rows.map((row) => {
      if (row.tools && typeof row.tools === "object") {
        return {
          user: row.user || row.username || "Unknown",
          total: row.total ?? Object.values(row.tools).reduce((sum, val) => sum + (Number(val) || 0), 0),
          tools: row.tools,
        };
      }

      const tools = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        if (!["user", "username", "total"].includes(key)) {
          tools[key] = Number(value) || 0;
        }
      });

      return {
        user: row.user || row.username || "Unknown",
        total: row.total ?? Object.values(tools).reduce((sum, val) => sum + val, 0),
        tools,
      };
    });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUserActivity({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        tool_view: toolView,
        exclude_admin: excludeAdmin,
      });
      setSummary(res.data.summary || []);
      setUserTable(normalizeUserTable(res.data.user_table || []));
      setTotals(res.data.totals || { total_events: 0, total_users: 0, total_tools: 0 });
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to fetch user activity.";
      message.error(detail);
      setSummary([]);
      setUserTable([]);
      setTotals({ total_events: 0, total_users: 0, total_tools: 0 });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, toolView, excludeAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sortedUserTable = useMemo(
    () => [...userTable].sort((a, b) => (b.total || 0) - (a.total || 0)),
    [userTable]
  );

  const tableColumns = useMemo(() => {
    const dynamicToolCols = summary.map((tool) => ({
      title: tool.tool,
      dataIndex: ["tools", tool.tool],
      key: tool.tool,
      align: "center",
      width: 110,
      render: (value) => value || 0,
    }));

    return [
      { title: "User", dataIndex: "user", key: "user", fixed: "left", width: 160 },
      {
        title: "Total Activity",
        dataIndex: "total",
        key: "total",
        align: "center",
        width: 130,
        defaultSortOrder: "descend",
        sorter: (a, b) => (a.total || 0) - (b.total || 0),
      },
      ...dynamicToolCols,
    ];
  }, [summary]);

  const chartData = useMemo(() => {
    const rows = summary.map((tool) => {
      const totalCountFromSeries = (tool.data || []).reduce((sum, point) => sum + (Number(point.count) || 0), 0);
      const uniqueUsersFromTable = userTable.reduce(
        (sum, row) => sum + ((row.tools?.[tool.tool] || 0) > 0 ? 1 : 0),
        0
      );

      return {
        tool: tool.tool,
        unique_users: tool.unique_users ?? uniqueUsersFromTable,
        total_count: tool.total_count ?? totalCountFromSeries,
      };
    });

    return rows.sort((a, b) => b[selectedMetric] - a[selectedMetric]);
  }, [summary, userTable, selectedMetric]);

  const topTool =
    chartData.length > 0
      ? chartData.reduce((best, row) => (row[selectedMetric] > best[selectedMetric] ? row : best), chartData[0]).tool
      : "N/A";

  const exportToExcel = () => {
    if (userTable.length === 0) {
      message.warning("No table data to export.");
      return;
    }

    const toolHeaders = summary.map((tool) => tool.tool);
    const headers = ["User", "Total Activity", ...toolHeaders];
    const rows = userTable.map((row) => [
      row.user,
      row.total || 0,
      ...toolHeaders.map((tool) => row.tools?.[tool] || 0),
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet["!cols"] = [
      { wch: 24 },
      { wch: 14 },
      ...toolHeaders.map(() => ({ wch: 18 })),
    ];

    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const address = XLSX.utils.encode_cell({ r, c });
        if (!worksheet[address]) continue;
        const isHeader = r === 0;
        worksheet[address].s = {
          font: { bold: isHeader, color: { rgb: isHeader ? "FFFFFFFF" : "FF111827" } },
          fill: { fgColor: { rgb: isHeader ? "FF4F46E5" : "FFFFFFFF" } },
          alignment: { horizontal: c === 0 ? "left" : "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "FFD1D5DB" } },
            bottom: { style: "thin", color: { rgb: "FFD1D5DB" } },
            left: { style: "thin", color: { rgb: "FFD1D5DB" } },
            right: { style: "thin", color: { rgb: "FFD1D5DB" } },
          },
        };
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "User Activity");
    const dateTag = dayjs().format("YYYYMMDD_HHmm");
    XLSX.writeFile(workbook, `user_activity_${toolView}_${excludeAdmin ? "exclude_admin" : "all_users"}_${dateTag}.xlsx`);
  };

  return (
    <div style={{ padding: 8 }}>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="bottom">
          <Col span={6}>
            <label>Date Range</label>
            <RangePicker
              style={{ width: "100%" }}
              value={startDate && endDate ? [dayjs(startDate), dayjs(endDate)] : null}
              format="YYYY-MM-DD"
              onChange={(dates) => {
                if (!dates || dates.length !== 2) {
                  setStartDate("");
                  setEndDate("");
                  return;
                }
                setStartDate(dates[0].format("YYYY-MM-DD"));
                setEndDate(dates[1].format("YYYY-MM-DD"));
              }}
            />
          </Col>
          <Col span={5}>
            <label>Metric</label>
            <Select
              value={selectedMetric}
              onChange={setSelectedMetric}
              style={{ width: "100%" }}
              options={[
                { value: "unique_users", label: "Unique users per tool" },
                { value: "total_count", label: "Total usage per tool" },
              ]}
            />
          </Col>
          <Col span={5}>
            <label>Tool Grouping</label>
            <Select
              value={toolView}
              onChange={setToolView}
              style={{ width: "100%" }}
              options={[
                { value: "specific", label: "Specific (with brackets)" },
                { value: "general", label: "General (without brackets)" },
              ]}
            />
          </Col>
          <Col span={8}>
            <Space>
              <Button type="primary" onClick={fetchData} loading={loading}>
                Apply Filters
              </Button>
              <Button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                disabled={loading}
              >
                Reset
              </Button>
              <Checkbox checked={excludeAdmin} onChange={(e) => setExcludeAdmin(e.target.checked)}>
                Exclude Admin
              </Checkbox>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Active Tools" value={totals.total_tools} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Active Users" value={totals.total_users} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Total Activities" value={totals.total_events} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Top Tool" value={topTool} />
          </Card>
        </Col>
      </Row>

      <Card
        title={`Users by Tool (${toolView === "general" ? "general grouping" : "specific grouping"})`}
        style={{ marginBottom: 24 }}
      >
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 32, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tool" interval={0} angle={-20} textAnchor="end" height={80} />
              <YAxis allowDecimals={false} domain={[0, "dataMax + 2"]} />
              <Tooltip />
              <Bar dataKey={selectedMetric} fill="#0ea5e9">
                <LabelList dataKey={selectedMetric} content={renderBarValueLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: "var(--text-muted)" }}>No activity data found for the selected date range.</div>
        )}
      </Card>

      <Card
        title="Per-user Tool Usage Details"
        extra={
          <Button onClick={exportToExcel} disabled={userTable.length === 0}>
            Download Excel
          </Button>
        }
      >
        <Table
          dataSource={sortedUserTable}
          columns={tableColumns}
          rowKey="user"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: "max-content" }}
        />
      </Card>
    </div>
  );
};

export default UserActivity;
