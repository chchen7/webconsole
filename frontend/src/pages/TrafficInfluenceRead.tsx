import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "../axios";
import Dashboard from "../Dashboard";
import {
  Button,
  Box,
  Card,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  Chip,
  Paper
} from "@mui/material";

export default function TrafficInfluenceRead() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [rule, setRule] = useState<any>(null);

  useEffect(() => {
    // Fixed to UDR endpoint
    axios.get(`/api/traffic-influence/udr/${id}`)
      .then((res) => {
        setRule(res.data);
      })
      .catch((err) => {
        console.error(`Fetch individual UDR rule failed:`, err);
      });
  }, [id]);

  const handleBack = () => navigate("/ti");
  const handleEdit = () => navigate(`/ti/edit/${id}`);

  if (!rule) return null;

  // Determine Target UE label based on UDR model
  const isAnyUe = rule.interGroupId === "AnyUE" || rule.targetUe === "AnyUE" || rule.anyUeInd;

  return (
    <Dashboard title="Traffic Influence Details (UDR)" refreshAction={() => {}}>
      <Box sx={{ p: 3 }}>
        <Grid container justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Typography variant="body2" color="textSecondary">
            Detailed information of the routing policy stored in UDR.
          </Typography>
          <Box>
            <Button variant="outlined" onClick={handleBack} sx={{ mr: 1 }}>
              BACK
            </Button>
            <Button variant="contained" color="primary" onClick={handleEdit}>
              EDIT
            </Button>
          </Box>
        </Grid>

        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>General Configuration</Typography>
        <Paper variant="outlined" sx={{ mb: 3 }}>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell sx={{ width: "40%", fontWeight: 'bold', bgcolor: '#fafafa' }}>Influence ID</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{id}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#fafafa' }}>Target UE / Scope</TableCell>
                <TableCell>
                  {isAnyUe ? (
                    <Chip label="Global (Any UE)" color="secondary" size="small" variant="outlined" />
                  ) : (
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {rule.supi || rule.targetUe || "N/A"}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#fafafa' }}>Data Network Name (DNN)</TableCell>
                <TableCell>{rule.dnn}</TableCell>
              </TableRow>
            </TableBody> 
          </Table> 
        </Paper>

        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>S-NSSAI Selection</Typography>
        <Paper variant="outlined" sx={{ mb: 3 }}>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell sx={{ width: "40%", fontWeight: 'bold', bgcolor: '#fafafa' }}>Slice Service Type (SST)</TableCell>
                <TableCell>{rule.snssai?.sst || rule.sst}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#fafafa' }}>Slice Differentiator (SD)</TableCell>
                <TableCell>{rule.snssai?.sd || rule.sd || "None"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Paper>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>Routing Information</Typography>
        <Paper variant="outlined" sx={{ mb: 3 }}>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell sx={{ width: "40%", fontWeight: 'bold', bgcolor: '#fafafa' }}>Target DNAI</TableCell>
                <TableCell>
                  <Chip label={rule.trafficRoutes?.[0]?.dnai || rule.dnai} color="primary" size="small" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Paper>

        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>Traffic Filters (PDR Flow Descriptions)</Typography>
        <Paper variant="outlined">
          <Table>
            <TableBody>
              {(!rule.trafficFilters || rule.trafficFilters.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={2} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    {rule.flowDescs ? rule.flowDescs.join(", ") : "No explicit traffic filters defined."}
                  </TableCell>
                </TableRow>
              ) : (
                rule.trafficFilters.map((filter: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell sx={{ width: "40%", fontWeight: 'bold', bgcolor: '#fafafa' }}>
                      Flow ID: {filter.flowId || index + 1}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {filter.flowDescriptions?.map((desc: string, i: number) => (
                        <div key={i}>{desc}</div>
                      )) || "N/A"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    </Dashboard>
  );
}