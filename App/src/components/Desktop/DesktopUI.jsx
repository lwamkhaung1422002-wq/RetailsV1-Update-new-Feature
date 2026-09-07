import { Box, Button, Card, CardContent, TextField, Typography } from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";

export function DesktopPage({ title, subtitle, actionLabel, onAction, children, actionIcon = <AddRoundedIcon />, actionDisabled = false, actionAfter, headerMarginBottom = 4 }) {
  return (
    <Box sx={{ maxWidth: 1440, mx: "auto", py: 1 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 3, mb: headerMarginBottom }}>
        <Box>
          <Typography sx={{ fontSize: 30, lineHeight: 1.2, fontWeight: 700 }}>{title}</Typography>
          {subtitle && <Typography color="text.secondary" sx={{ mt: 0.75, fontSize: 15 }}>{subtitle}</Typography>}
        </Box>
        {(actionLabel || actionAfter) && <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>{actionLabel && <Button variant="contained" startIcon={actionIcon} onClick={onAction} disabled={actionDisabled} sx={{ minHeight: 44, px: 2.25, borderRadius: 2, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>{actionLabel}</Button>}{actionAfter}</Box>}
      </Box>
      {children}
    </Box>
  );
}

export function DesktopPanel({ children, sx = {} }) {
  return <Card sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", boxShadow: "0 3px 12px rgba(15,23,42,0.07)", ...sx }}><CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>{children}</CardContent></Card>;
}

export function DesktopStat({ label, value, color = "primary.main", helper, action }) {
  return <DesktopPanel><Typography color="text.secondary" sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography><Box sx={{ display: "flex", alignItems: "center", gap: .5, mt: 1.5 }}><Typography color={color} sx={{ fontSize: 27, fontWeight: 700 }}>{value}</Typography>{action}</Box>{helper && <Typography color="text.secondary" sx={{ fontSize: 13, mt: 0.75 }}>{helper}</Typography>}</DesktopPanel>;
}

export function DesktopSearch({ value, onChange, placeholder = "Search..." }) {
  return <TextField fullWidth value={value} onChange={onChange} placeholder={placeholder} slotProps={{ input: { startAdornment: <SearchRoundedIcon sx={{ mr: 1.25, color: "text.secondary" }} /> } }} sx={{ maxWidth: 460, "& .MuiOutlinedInput-root": { height: 46, borderRadius: 2, bgcolor: "background.paper" } }} />;
}

export function DesktopPlaceholder({ title, description, primaryLabel, onPrimary, children }) {
  return <DesktopPage title={title} subtitle={description} actionLabel={primaryLabel} onAction={onPrimary}><Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 0.7fr)", gap: 3 }}><DesktopPanel>{children}</DesktopPanel><DesktopPanel sx={{ bgcolor: "#f6f9fd" }}><Typography sx={{ fontSize: 18, fontWeight: 700 }}>Quick overview</Typography><Typography color="text.secondary" sx={{ fontSize: 15, lineHeight: 1.7, mt: 1.25 }}>Manage your {title.toLowerCase()} from one central workspace. Data shown here will be connected to your API later.</Typography></DesktopPanel></Box></DesktopPage>;
}
