package WebUI

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/free5gc/openapi/models"
	"github.com/free5gc/util/mongoapi"
	"github.com/free5gc/webconsole/backend/logger"
	"github.com/free5gc/webconsole/backend/webui_context"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
)

func formatInfluenceDataUDR(data map[string]interface{}) {
	if infId, ok := data["influenceId"].(string); ok {
		data["subId"] = infId
	} else if resUri, ok := data["resUri"].(string); ok {
		parts := strings.Split(resUri, "/")
		data["subId"] = parts[len(parts)-1]
	}

	if snssaiData, exists := data["snssai"]; exists {
		snssaiBytes, _ := json.Marshal(snssaiData)
		var snssai map[string]interface{}
		json.Unmarshal(snssaiBytes, &snssai)
		if sstFloat, ok := snssai["sst"].(float64); ok {
			data["sst"] = int32(sstFloat)
		}
		if sdStr, ok := snssai["sd"].(string); ok {
			data["sd"] = sdStr
		}
	}

	if routesData, exists := data["trafficRoutes"]; exists {
		var routes []map[string]interface{}
		routesBytes, _ := json.Marshal(routesData)
		if json.Unmarshal(routesBytes, &routes) == nil && len(routes) > 0 {
			if dnaiStr, ok := routes[0]["dnai"].(string); ok {
				data["dnai"] = dnaiStr
			}
		}
	}

	if filtersData, exists := data["trafficFilters"]; exists {
		var filters []map[string]interface{}
		filtersBytes, _ := json.Marshal(filtersData)
		if json.Unmarshal(filtersBytes, &filters) == nil {
			var flowDescs []string
			for _, f := range filters {
				if descs, ok := f["flowDescriptions"].([]interface{}); ok {
					for _, d := range descs {
						if s, ok := d.(string); ok {
							flowDescs = append(flowDescs, s)
						}
					}
				}
			}
			data["flowDescs"] = flowDescs
		}
	}

	if interGroup, ok := data["interGroupId"].(string); ok && interGroup == "AnyUE" {
		data["targetUe"] = "AnyUE"
	} else if supiStr, ok := data["supi"].(string); ok {
		data["targetUe"] = supiStr
	}
}

func GetTrafficInfluenceRulesUDR(c *gin.Context) {
	logger.ProcLog.Info("Get TI Rules from MongoDB (UDR Mode)")
	setCorsHeader(c)

	filter := bson.M{}
	rawDbData, err := mongoapi.RestfulAPIGetMany("applicationData.influenceData", filter)
	if err != nil {
		logger.ProcLog.Errorf("DB Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"cause": "Database Query Failed"})
		return
	}

	influenceDataList := make([]map[string]interface{}, 0)
	for _, rawData := range rawDbData {
		formatInfluenceDataUDR(rawData)
		influenceDataList = append(influenceDataList, rawData)
	}
	c.JSON(http.StatusOK, influenceDataList)
}
func GetIndividualTrafficInfluenceRuleUDR(c *gin.Context) {
	logger.ProcLog.Info("Get Individual Traffic Influence Rule (UDR Mode)")
	setCorsHeader(c)

	subID := c.Param("subId")
	filter := bson.M{
		"$or": []bson.M{
			{"influenceId": subID},
			{"resUri": bson.M{"$regex": subID + "$"}},
		},
	}

	rawDbData, err := mongoapi.RestfulAPIGetOne("applicationData.influenceData", filter)
	if err != nil {
		logger.ProcLog.Errorf("Individual Query DB Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"cause": "Database Query Failed"})
		return
	}

	if len(rawDbData) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"cause": "Rule not found"})
		return
	}

	formatInfluenceDataUDR(rawDbData)
	c.JSON(http.StatusOK, rawDbData)
}

func PostTrafficInfluenceRuleUDR(c *gin.Context) {
	logger.ProcLog.Info("Provisioning TI Data to UDR V2")
	setCorsHeader(c)

	var req TiRule
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"cause": "Invalid JSON"})
		return
	}

	filter := bson.M{
		"snssai.sst": req.Sst,
		"snssai.sd":  req.Sd,
		"dnn":        req.Dnn,
	}

	if req.TargetUe == "AnyUE" || req.TargetUe == "" {
		filter["interGroupId"] = "AnyUE"
	} else {
		filter["supi"] = req.TargetUe
	}

	existing, err := mongoapi.RestfulAPIGetMany("applicationData.influenceData", filter)
	if err == nil && len(existing) > 0 {
		logger.ProcLog.Warn("Conflict: Duplicate routing rule detected in UDR")
		c.JSON(http.StatusConflict, gin.H{"cause": "Conflict: Duplicate routing rule detected"})
		return
	}

	webuiSelf := webui_context.GetSelf()
	webuiSelf.UpdateNfProfiles()

	if udrUris := webuiSelf.GetOamUris(models.NrfNfManagementNfType_UDR); udrUris != nil {
		influenceId := fmt.Sprintf("ti-%d", time.Now().Unix())
		requestUri := fmt.Sprintf("%s/nudr-dr/v2/application-data/influenceData/%s", udrUris[0], influenceId)
		udrPayload := models.TrafficInfluData{
			AfAppId: "OAM-WebConsole",
			Dnn:     req.Dnn,
			Snssai:  &models.Snssai{Sst: req.Sst, Sd: req.Sd},
			TrafficRoutes: []*models.RouteToLocation{
				{Dnai: req.Dnai},
			},
			ResUri: requestUri,
		}

		if req.TargetUe == "AnyUE" || req.TargetUe == "" {
			udrPayload.InterGroupId = "AnyUE"
		} else {
			udrPayload.Supi = req.TargetUe
		}

		var trafficFilters []models.FlowInfo
		for i, desc := range req.FlowDescs {
			trafficFilters = append(trafficFilters, models.FlowInfo{
				FlowId:           int32(i + 1),
				FlowDescriptions: []string{desc},
			})
		}
		udrPayload.TrafficFilters = trafficFilters

		jsonData, _ := json.Marshal(udrPayload)
		ctx, pd, tokerErr := webuiSelf.GetTokenCtx(models.ServiceName_NUDR_DR, models.NrfNfManagementNfType_UDR)
		if tokerErr != nil {
			logger.ProcLog.Errorf("GetTokenCtx error: %+v", tokerErr)
			c.JSON(http.StatusInternalServerError, pd)
			return
		}
		// Post is not allow, use Put
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPut, requestUri, bytes.NewBuffer(jsonData))
		if err != nil {
			logger.ProcLog.Error(err)
			c.JSON(http.StatusInternalServerError, gin.H{})
			return
		}

		if err = webuiSelf.RequestBindToken(httpReq, ctx); err != nil {
			logger.ProcLog.Error(err)
			c.JSON(http.StatusInternalServerError, gin.H{})
			return
		}

		client := &http.Client{Timeout: 10 * time.Second}
		resp, res_err := client.Do(httpReq)
		if res_err != nil {
			logger.ProcLog.Error(res_err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"cause": "UDR Connection Timeout"})
			return
		}
		defer resp.Body.Close()

		bodyBytes, _ := io.ReadAll(resp.Body)
		c.Data(resp.StatusCode, "application/json", bodyBytes)
		return
	} else {
		logger.ProcLog.Warn("UDR not found")
	}

	c.JSON(http.StatusInternalServerError, gin.H{"cause": "UDR not found"})
}

func DeleteTrafficInfluenceRuleUDR(c *gin.Context) {
	logger.ProcLog.Info("Delete TI Rule from UDR V2")
	setCorsHeader(c)

	subID := c.Param("subId")
	webuiSelf := webui_context.GetSelf()
	webuiSelf.UpdateNfProfiles()

	if udrUris := webuiSelf.GetOamUris(models.NrfNfManagementNfType_UDR); udrUris != nil {
		udrUrl := fmt.Sprintf("%s/nudr-dr/v2/application-data/influenceData/%s", udrUris[0], subID)

		ctx, pd, tokerErr := webuiSelf.GetTokenCtx(models.ServiceName_NUDR_DR, models.NrfNfManagementNfType_UDR)
		if tokerErr != nil {
			logger.ProcLog.Errorf("GetTokenCtx error: %+v", tokerErr)
			c.JSON(http.StatusInternalServerError, pd)
			return
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodDelete, udrUrl, nil)
		if err != nil {
			logger.ProcLog.Error(err)
			c.JSON(http.StatusInternalServerError, gin.H{})
			return
		}
		if err = webuiSelf.RequestBindToken(httpReq, ctx); err != nil {
			logger.ProcLog.Error(err)
			c.JSON(http.StatusInternalServerError, gin.H{})
			return
		}

		client := &http.Client{Timeout: 10 * time.Second}
		resp, res_err := client.Do(httpReq)
		if res_err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"cause": "UDR Request Failed"})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusOK {
			c.JSON(http.StatusOK, gin.H{"status": "Deleted"})
		} else {
			body, _ := io.ReadAll(resp.Body)
			c.JSON(resp.StatusCode, gin.H{"cause": "Delete Failed", "details": string(body)})
		}
		return
	} else {
		logger.ProcLog.Warn("UDR not found")
	}

	c.JSON(http.StatusInternalServerError, gin.H{"cause": "UDR not found"})
}

func PutTrafficInfluenceRuleUDR(c *gin.Context) {
	logger.ProcLog.Info("Updating TI Data in UDR V2")
	setCorsHeader(c)

	influenceId := c.Param("subId")
	if influenceId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"cause": "Missing Influence ID"})
		return
	}

	var req TiRule
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"cause": "Invalid JSON"})
		return
	}

	filter := bson.M{
		"snssai.sst": req.Sst,
		"snssai.sd":  req.Sd,
		"dnn":        req.Dnn,
	}

	if req.TargetUe == "AnyUE" || req.TargetUe == "" {
		filter["interGroupId"] = "AnyUE"
	} else {
		filter["supi"] = req.TargetUe
	}

	existing, err := mongoapi.RestfulAPIGetMany("applicationData.influenceData", filter)
	if err == nil && len(existing) > 0 {
		isConflict := false
		for _, doc := range existing {
			docId, _ := doc["influenceId"].(string)
			docUri, _ := doc["resUri"].(string)

			if (docId != "" && docId != influenceId) || (docUri != "" && !strings.HasSuffix(docUri, "/"+influenceId)) {
				isConflict = true
				break
			}
		}

		if isConflict {
			logger.ProcLog.Warn("Conflict: Duplicate routing rule detected in UDR during Update")
			c.JSON(http.StatusConflict, gin.H{"cause": "Conflict: Duplicate routing rule detected"})
			return
		}
	}

	webuiSelf := webui_context.GetSelf()
	webuiSelf.UpdateNfProfiles()

	if udrUris := webuiSelf.GetOamUris(models.NrfNfManagementNfType_UDR); udrUris != nil {
		requestUri := fmt.Sprintf("%s/nudr-dr/v2/application-data/influenceData/%s", udrUris[0], influenceId)
		logger.ProcLog.Infof("PUT Update Request to: %s", requestUri)

		udrPayload := models.TrafficInfluData{
			AfAppId: "OAM-WebConsole",
			Dnn:     req.Dnn,
			Snssai:  &models.Snssai{Sst: req.Sst, Sd: req.Sd},
			TrafficRoutes: []*models.RouteToLocation{
				{Dnai: req.Dnai},
			},
			ResUri: requestUri,
		}

		if req.TargetUe == "AnyUE" || req.TargetUe == "" {
			udrPayload.InterGroupId = "AnyUE"
		} else {
			udrPayload.Supi = req.TargetUe
		}

		var trafficFilters []models.FlowInfo
		for i, desc := range req.FlowDescs {
			trafficFilters = append(trafficFilters, models.FlowInfo{
				FlowId:           int32(i + 1),
				FlowDescriptions: []string{desc},
			})
		}
		udrPayload.TrafficFilters = trafficFilters

		jsonData, _ := json.Marshal(udrPayload)
		ctx, pd, tokerErr := webuiSelf.GetTokenCtx(models.ServiceName_NUDR_DR, models.NrfNfManagementNfType_UDR)
		if tokerErr != nil {
			logger.ProcLog.Errorf("GetTokenCtx error: %+v", tokerErr)
			c.JSON(http.StatusInternalServerError, pd)
			return
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPut, requestUri, bytes.NewBuffer(jsonData))
		if err != nil {
			logger.ProcLog.Error(err)
			c.JSON(http.StatusInternalServerError, gin.H{})
			return
		}

		if err = webuiSelf.RequestBindToken(httpReq, ctx); err != nil {
			logger.ProcLog.Error(err)
			c.JSON(http.StatusInternalServerError, gin.H{})
			return
		}

		client := &http.Client{Timeout: 10 * time.Second}
		resp, res_err := client.Do(httpReq)
		if res_err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"cause": "UDR Connection Timeout"})
			return
		}
		defer resp.Body.Close()

		bodyBytes, _ := io.ReadAll(resp.Body)
		c.Data(resp.StatusCode, "application/json", bodyBytes)
		return
	} else {
		logger.ProcLog.Warn("UDR not found")
	}

	c.JSON(http.StatusInternalServerError, gin.H{"cause": "UDR not found"})
}
