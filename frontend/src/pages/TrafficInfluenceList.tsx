import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Dashboard from "../Dashboard";
import {
  Button, Table, TableBody, TableCell, TableHead, TableRow,
  Paper, Box, Typography, Chip
} from "@mui/material";
import axios from "../axios";

// Interface aligned with the backend's formatInfluenceDataUDR logic
interface TiRule {
  subId: string;    // Backend maps influenceId/resUri to subId
  targetUe: string; // "AnyUE" or specific SUPI (imsi-...)
  dnai: string;
  dnn: string;
  sst: number;
  sd: string;
  flowDescs?: string[];
}

export default function TrafficInfluenceList() {
  const [data, setData] = useState<TiRule[]>([]);
  const [refresh, setRefresh] = useState<boolean>(false);
  const navigate = useNavigate();

  // Fetch only from UDR endpoint
  useEffect(() => {
    axios.get("/api/traffic-influence/udr")
      .then((res) => {
        setData(Array.isArray(res.data) ? res.data : []);
      })
      .catch((e) => {
        setData([]);
        console.error("Fetch UDR rules failed:", e);
      });
  }, [refresh]);

  const handleDelete = (subId: string) => {
    if (window.confirm(`Are you sure you want to delete rule [${subId}]?`)) {
      axios.delete(`/api/traffic-influence/udr/${subId}`)
        .then(() => {
          setRefresh(!refresh);
        })
        .catch((e) => {
          console.error("Delete failed:", e);
          alert("Failed to delete the rule from UDR.");
        });
    }
  };

  const handleView = (subId: string) => navigate(`/ti/read/${subId}`);
  const handleEdit = (subId: string) => navigate(`/ti/edit/${subId}`);
  const handleCreate = () => navigate("/ti/create");

  return (
    <Dashboard title="Traffic Influence (UDR Mode)" refreshAction={() => setRefresh(!refresh)}>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Active Routing Policies</Typography>
          </Box>
          <Button variant="contained" color="primary" onClick={handleCreate} sx={{ fontWeight: 'bold' }}>
            + New Edge Route
          </Button>
        </Box>
        <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, boxShadow: 3 }}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f0f2f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Influence ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Target Scope</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>DNN</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>S-NSSAI (SST/SD)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>DNAI (Edge)</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                    <Typography color="textSecondary" variant="h6">
                      No active TI rules found in UDR.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.subId} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell sx={{ fontFamily: 'monospace', color: '#1a73e8', fontWeight: 'bold' }}>
                      {row.subId}
                    </TableCell>
                    <TableCell>
                      {row.targetUe === "AnyUE" ? (
                        <Chip label="Global (Any UE)" color="secondary" size="small" sx={{ fontWeight: 'bold' }} />
                      ) : (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{row.targetUe}</Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.dnn}</TableCell>
                    <TableCell>
                      <Chip label={`${row.sst}:${row.sd || 'none'}`} variant="outlined" size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip label={row.dnai} color="primary" size="small" sx={{ minWidth: '60px' }} />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleView(row.subId)}
                        >
                          VIEW
                        </Button>
                        <Button
                          variant="outlined"
                          color="info"
                          size="small"
                          onClick={() => handleEdit(row.subId)}
                        >
                          EDIT
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                          onClick={() => handleDelete(row.subId)}
                        >
                          DELETE
                        </Button>
                      </Box>
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