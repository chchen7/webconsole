package WebUI

type TiRule struct {
	TargetUe  string   `json:"targetUe"`
	Dnai      string   `json:"dnai"`
	Dnn       string   `json:"dnn"`
	Sst       int32    `json:"sst"`
	Sd        string   `json:"sd"`
	FlowDescs []string `json:"flowDescs"`
}
