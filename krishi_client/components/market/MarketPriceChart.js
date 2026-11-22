"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const number = (value, locale) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-BD", { maximumFractionDigits: 2 }).format(value);

export function MarketPriceChart({ data, locale = "en", title }) {
  const bn = locale === "bn";
  return <div className="h-[260px] min-w-0 w-full sm:h-[300px]" role="img" aria-label={title}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#e7e5dc" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="observedOn" tickFormatter={(value) => String(value).slice(0, 10)} minTickGap={24} tick={{ fontSize: 11, fill: "#647067" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(value) => `৳${number(value, locale)}`} width={76} tick={{ fontSize: 11, fill: "#647067" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
        <Tooltip labelFormatter={(value) => `${bn ? "পর্যবেক্ষণ" : "Observed"}: ${String(value).slice(0, 10)}`} formatter={(value, name) => [`৳${number(value, locale)}`, name]} contentStyle={{ borderRadius: 12, border: "1px solid #d9ded3", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line type="monotone" dataKey="priceMin" name={bn ? "প্রতিবেদিত সর্বনিম্ন" : "Reported low"} stroke="#247a4b" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} connectNulls={false} />
        <Line type="monotone" dataKey="priceMax" name={bn ? "প্রতিবেদিত সর্বোচ্চ" : "Reported high"} stroke="#ac8052" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export function ForecastPriceChart({ data, locale = "en" }) {
  const bn = locale === "bn";
  return <div className="h-[260px] min-w-0 w-full sm:h-[300px]" role="img" aria-label={bn ? "দরের মডেল পূর্বাভাস চার্ট" : "Modelled price forecast chart"}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#e7e5dc" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(0, 10)} minTickGap={24} tick={{ fontSize: 11, fill: "#647067" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(value) => `৳${number(value, locale)}`} width={76} tick={{ fontSize: 11, fill: "#647067" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
        <Tooltip labelFormatter={(value) => `${bn ? "পূর্বাভাসের তারিখ" : "Forecast date"}: ${String(value).slice(0, 10)}`} formatter={(value, name) => [`৳${number(value, locale)}`, name]} contentStyle={{ borderRadius: 12, border: "1px solid #d9ded3", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line type="monotone" dataKey="lower90" name={bn ? "নিম্ন ৯০% সীমা" : "Lower 90% range"} stroke="#ac8052" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="price" name={bn ? "মডেল অনুমান" : "Model estimate"} stroke="#d99631" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="upper90" name={bn ? "উচ্চ ৯০% সীমা" : "Upper 90% range"} stroke="#ac8052" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
