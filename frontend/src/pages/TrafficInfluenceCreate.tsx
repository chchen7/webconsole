import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "../axios";
import Dashboard from "../Dashboard";
import {
  Button, Box, Card, Grid, Table, TableBody, TableCell, TableRow,
  TextField, Typography, Checkbox, FormControlLabel, Paper
} from "@mui/material";

export default function TrafficInfluenceCreate() {
  const { id } = useParams<{ id: string }>(); 
  const navigate = useNavigate();
  const isEdit = !!id;

  // State Management
  const [targetUe, setTargetUe] = useState("");
  const [dnai, setDnai] = useState("mec");
  const [dnn, setDnn] = useState("internet");
  const [sst, setSst] = useState<number | string>(1);
  const [sd, setSd] = useState("010203"); 
  const [isAnyUe, setIsAnyUe] = useState(true);

  const defaultFlow = "permit out ip from any to 10.60.0.0/16";
  const [flowDescs, setFlowDescs] = useState<string[]>([defaultFlow]);

  // Fetch data for Edit mode (UDR only)
  useEffect(() => {
    if (isEdit) {
      axios.get(`/api/traffic-influence/udr/${id}`)
        .then((res) => {
          const rule = res.data;
          // Determine if it's an AnyUE rule based on interGroupId
          const isRuleAnyUe = rule.interGroupId === "AnyUE" || rule.targetUe === "AnyUE";
          setIsAnyUe(isRuleAnyUe);
          setTargetUe(isRuleAnyUe ? "AnyUE" : (rule.supi || rule.targetUe || ""));
          setDnai(rule.dnai || "mec");
          setDnn(rule.dnn || "internet");
          setSst(rule.sst || 1);
          setSd(rule.sd || "010203");
          if (rule.flowDescs?.length > 0) setFlowDescs(rule.flowDescs);
        })
        .catch((err) => console.error("Fetch UDR rule failed:", err));
    }
  }, [id, isEdit]);

  const handleSubmit = () => {
    if (!dnai.trim()) {
      alert("DNAI is mandatory for edge routing!");
      return;
    }

    if (!isAnyUe && !targetUe.trim()) {
      alert("SUPI (e.g., imsi-...) is required for individual steering!");
      return;
    }

    const payload = {
      targetUe: isAnyUe ? "AnyUE" : targetUe.trim(),
      dnai: dnai.trim(),
      dnn: dnn.trim(),
      sst: Number(sst),
      sd: sd.trim(),
      flowDescs: flowDescs.filter(d => d.trim() !== "")
    };

    // For UDR, we typically PUT to a specific ID. 
    // If Editing, we overwrite the existing resource; if Creating, we POST/PUT a new one.
    const apiCall = isEdit 
      ? axios.put(`/api/traffic-influence/udr/${id}`, payload)
      : axios.post(`/api/traffic-influence/udr`, payload);

    apiCall
      .then(() => {
        alert(isEdit ? "Rule updated successfully" : "New edge route provisioned to UDR");
        navigate("/ti");
      })
      .catch((err) => {
        console.error("UDR Provisioning failed:", err);
        const backendError = err.response?.data?.cause;
        const errorMessage = backendError 
          ? `Operation failed: ${backendError}` 
          : "Operation failed. Please check UDR connectivity.";

        alert(errorMessage);
      });
  };

  return (
    <Dashboard title={isEdit ? "Edit Edge Route (UDR)" : "Provision New Edge Route (UDR)"} refreshAction={() => {}}>
      <Box sx={{ p: 3 }}>
        <Grid container justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="body2" color="textSecondary">
            Configure Traffic Influence data to be stored in the Unified Data Repository.
          </Typography>
          <Box>
            <Button variant="outlined" onClick={() => navigate("/ti")} sx={{ mr: 1 }}>CANCEL</Button>
            <Button variant="contained" color="primary" onClick={handleSubmit}>{isEdit ? "UPDATE" : "PROVISION"}</Button>
          </Box>
        </Grid>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold', color: '#1976d2' }}>1. Scope Selection</Typography>
        <Paper variant="outlined" sx={{ mb: 3, p: 2 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={<Checkbox checked={isAnyUe} onChange={(e) => setIsAnyUe(e.target.checked)} />}
                label="Target Any UE (Global Rule)" disabled={isEdit}
              />
            </Grid>
            {!isAnyUe && (
              <Grid item xs={12} md={8}>
                <TextField 
                  fullWidth 
                  label="Subscriber ID (SUPI)" 
                  variant="standard" 
                  value={targetUe}
                  onChange={(e) => setTargetUe(e.target.value)} 
                  placeholder="imsi-208930000000001"
                  helperText="Enter the IMSI with 'imsi-' prefix"
                  disabled={isEdit}
                />
              </Grid>
            )}
          </Grid>
        </Paper>

        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold', color: '#1976d2' }}>2. Network & Slice Identifiers</Typography>
        <Paper variant="outlined" sx={{ mb: 3, p: 2 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Data Network Name (DNN)" variant="standard" value={dnn} disabled={isEdit} onChange={(e) => setDnn(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Target DNAI" variant="standard" value={dnai} onChange={(e) => setDnai(e.target.value)} placeholder="mec" />
            </Grid>
            <Grid item xs={6}>
              <TextField type="number" label="SST" fullWidth variant="standard" value={sst} disabled={isEdit} onChange={(e) => setSst(e.target.value)} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="SD" fullWidth variant="standard" value={sd} disabled={isEdit} onChange={(e) => setSd(e.target.value)} />
            </Grid>
          </Grid>
        </Paper>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold', color: '#1976d2' }}>3. Traffic Filters (Flow Descriptions)</Typography>
        <Paper variant="outlined" sx={{ p: 2 }}>
          {flowDescs.map((flow, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography sx={{ minWidth: '80px' }}>Flow {index + 1}:</Typography>
              <TextField 
                fullWidth 
                variant="outlined" 
                size="small" 
                value={flow} 
                onChange={(e) => {
                  const next = [...flowDescs];
                  next[index] = e.target.value;
                  setFlowDescs(next);
                }} 
              />
              <Button color="error" variant="text" onClick={() => setFlowDescs(flowDescs.filter((_, i) => i !== index))} disabled={flowDescs.length === 1}>
                Remove
              </Button>
            </Box>
          ))}
          <Button variant="dashed" fullWidth onClick={() => setFlowDescs([...flowDescs, defaultFlow])} sx={{ mt: 1, border: '1px dashed #ccc' }}>
            + Add Traffic Filter
          </Button>
        </Paper>
      </Box>
    </Dashboard>
  );
}